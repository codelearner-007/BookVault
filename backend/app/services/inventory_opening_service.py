"""Inventory starting balances (PR-62, posting-rules §10, D-35).

Each inventory item's starting balance is its own `opening_balance` document dated
books_start_date - 1: Dr Inventory on hand[item] total cost / Cr Retained earnings, plus stock
movements for the qty on hand per location (owned = on hand; the cost split by quantity, the last
location takes the rounding rest). Changing it voids the record's document and posts a new one;
saving quantities and cost is enough (no hidden per-location requirement, T69 BookVault variant).
"""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import LedgerValidationError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.repositories.coa_repository import CoaRepository
from app.repositories.inventory_repository import InventoryRepository
from app.schemas.request.inventory import SetInventoryStartingBalanceRequest
from app.schemas.response.inventory import (
    InventoryStartingBalanceItem,
    InventoryStartingBalancesResponse,
    LocationStock,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.posting import OPENING_BALANCE, POSTED, SOURCE_OPENING, DocumentHeader, LineInput, PostingService
from app.services.stock_ledger import Move, StockLedger

AREA = "settings.starting_balances"
KIND_INVENTORY_ITEM = "inventory_item"
ON_HAND, RETAINED_EARNINGS = "inventory_on_hand", "retained_earnings"
ZERO = Decimal(0)


def split_cost(total: Decimal, qtys: list[Decimal], dp: int) -> list[Decimal]:
    """Cost per location in proportion to its quantity; the last one takes the rounding rest."""
    whole = sum(qtys, ZERO)
    parts = [round_money(total * q / whole, dp) for q in qtys[:-1]]
    return [*parts, total - sum(parts, ZERO)]


class InventoryOpeningService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = InventoryRepository(session)
        self.posting = PostingService(session)
        self.stock = StockLedger(session)
        self.coa = CoaRepository(session)
        self.audit = AuditService(session)

    async def list_items(self, business_id: str, params: PageParams) -> InventoryStartingBalancesResponse:
        rows, total = await self.repo.item_page(business_id, None, params.offset, params.page_size)
        live = await self.repo.live_openings(business_id)
        dp = await self.posting.decimals(business_id)
        start = await self.posting.books_start_date(business_id)
        items = [await self._item(business_id, r.id, r.code, r.name, live.get(r.id), dp) for r in rows]
        return InventoryStartingBalancesResponse.build(items, total, params.page, params.page_size,
                                                       books_start_date=start, opening_date=start - timedelta(days=1))

    async def _item(self, business_id: str, item_id: str, code: str | None, name: str, document_id: str | None,
                    dp: int) -> InventoryStartingBalanceItem:
        moves = await self.repo.movements_of(business_id, document_id) if document_id else []
        names = await self.repo.location_names(business_id)
        return InventoryStartingBalanceItem(
            item_id=item_id, item_code=code, item_name=name, document_id=document_id,
            locations=[LocationStock(location_id=m.location_id, location_name=names[m.location_id],
                                     qty_on_hand=m.qty_on_hand) for m in moves],
            qty=sum((m.qty_owned for m in moves), ZERO), total_cost=round_money(sum((m.amount for m in moves), ZERO), dp))

    async def set_item(self, ctx: BusinessContext, item_id: str,
                       body: SetInventoryStartingBalanceRequest) -> InventoryStartingBalanceItem:
        row = await self.repo.item_row(ctx.business_id, item_id) if is_uuid(item_id) else None
        if row is None:
            raise ResourceNotFoundError("InventoryItem", item_id)
        for x in body.locations:
            if await self.repo.location(ctx.business_id, x.location_id) is None:
                raise LedgerValidationError("Inventory location not found in this business", "invalid_location")
        dp = await self.posting.decimals(ctx.business_id)
        live = (await self.repo.live_openings(ctx.business_id)).get(row.id)
        before = await self._item(ctx.business_id, row.id, row.code, row.name, live, dp)
        if live:
            await self._void(ctx, live, replaced=bool(body.locations))
        if body.locations:
            start = await self.posting.books_start_date(ctx.business_id)
            await self._post(ctx, row.id, start - timedelta(days=1), round_money(body.total_cost, dp),
                             [(x.location_id, x.qty) for x in body.locations], dp)
        live = (await self.repo.live_openings(ctx.business_id)).get(row.id)
        after = await self._item(ctx.business_id, row.id, row.code, row.name, live, dp)
        await self.audit.record(ctx.user_id, "set", "InventoryStartingBalance", row.id, ctx.business_id,
                                before=before, after=after)
        return after

    async def redate(self, ctx: BusinessContext, new_start: date) -> None:
        """Moving books_start_date: every live inventory opening is voided and posted again at the new date."""
        dp = await self.posting.decimals(ctx.business_id)
        for item_id, document_id in (await self.repo.live_openings(ctx.business_id)).items():
            moves = await self.repo.movements_of(ctx.business_id, document_id)
            await self._void(ctx, document_id, replaced=True)
            await self._post(ctx, item_id, new_start - timedelta(days=1), sum((m.amount for m in moves), ZERO),
                             [(m.location_id, m.qty_owned) for m in moves], dp)

    async def _void(self, ctx: BusinessContext, document_id: str, *, replaced: bool) -> None:
        """Void the record's opening; a replacement posted next re-costs the item (no transient shortfall)."""
        document = await self.posting.get_document(ctx.business_id, document_id, OPENING_BALANCE, for_update=True)
        await self.posting.void(ctx, document)
        await self.stock.remove(ctx, document, recost=not replaced)

    async def _post(self, ctx: BusinessContext, item_id: str, on: date, total: Decimal,
                    locations: list[tuple[str, Decimal]], dp: int) -> None:
        lines = []
        if total > 0:
            on_hand = await self.coa.system_account_id(ctx.business_id, ON_HAND)
            plug = await self.coa.system_account_id(ctx.business_id, RETAINED_EARNINGS)
            lines = [LineInput(on_hand, total, ZERO, item_id=item_id), LineInput(plug, ZERO, total)]
        document = await self.posting.create_document(ctx, OPENING_BALANCE, AREA, DocumentHeader(on, None, None),
                                                      lines, POSTED)
        if lines:
            await self.posting.post(ctx, document, SOURCE_OPENING)
        await self.posting.link_opening_balance(ctx, document, KIND_INVENTORY_ITEM, item_id=item_id)
        amounts = split_cost(total, [q for _, q in locations], dp)
        await self.stock.apply(ctx, document, OPENING_BALANCE, [
            Move(item_id, location_id, no, qty_owned=qty, qty_on_hand=qty, amount=amount)
            for no, ((location_id, qty), amount) in enumerate(zip(locations, amounts), start=1)])
