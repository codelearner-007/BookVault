"""Inventory transfers, write-offs and production orders (B6; PR-45, PR-46, PR-47): one service per kind.

Flow (story): validate -> store document, stock_documents (+ production_orders) and lines -> on post,
the stock ledger moves the stock and posts the entry: transfers move on-hand qty between locations
(no ledger lines, PR-45); a write-off moves owned and on-hand qty out at moving average (Dr the line's
account, default Inventory write-offs / Cr Inventory on hand); a production order consumes its bill
of materials at moving average and adds capitalised costs into the finished item (Dr Inventory on
hand[finished] / Cr Inventory on hand[components] / Cr cost accounts). Edit = re-post, void = reversal.
"""

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, LedgerValidationError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.models.inventory import ProductionOrder, StockDocument, StockDocumentLine
from app.models.ledger import Document
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.master_data_repository import MasterDataRepository
from app.schemas.response.inventory import (
    StockDocumentListItem,
    StockDocumentListResponse,
    StockDocumentResponse,
    StockLineResponse,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.posting import DRAFT, POSTED, VOID, DocumentHeader, PostingService
from app.services.stock_ledger import Move, StockLedger
from app.services.versioning import check_version

ZERO = Decimal(0)
TRANSFER, WRITE_OFF, PRODUCTION = "inventory_transfer", "inventory_write_off", "production_order"
INVENTORY = "inventory"


@dataclass(frozen=True)
class StockKind:
    key: str
    area: str
    path: str
    entity: str


STOCK_KINDS = {k.key: k for k in (
    StockKind(TRANSFER, "inventory_transfers", "inventory-transfers", "InventoryTransfer"),
    StockKind(WRITE_OFF, "inventory_write_offs", "inventory-write-offs", "InventoryWriteOff"),
    StockKind(PRODUCTION, "production_orders", "production-orders", "ProductionOrder"),
)}


def _display_status(kind: StockKind, status: str) -> str:
    return "completed" if kind.key == PRODUCTION and status == POSTED else status


class StockDocumentService:
    def __init__(self, session: AsyncSession, kind: StockKind) -> None:
        self.kind = kind
        self.repo = InventoryRepository(session)
        self.master = MasterDataRepository(session)
        self.posting = PostingService(session)
        self.stock = StockLedger(session)
        self.audit = AuditService(session)

    # ---------------------------------------------------------------- reads
    async def list_page(self, business_id: str, params: PageParams, search: str | None) -> StockDocumentListResponse:
        dp = await self.posting.decimals(business_id)
        rows, total = await self.repo.stock_document_page(business_id, self.kind.key, search, params.offset,
                                                          params.page_size)
        items = [StockDocumentListItem.model_validate({
            **r._mapping, "total_cost": round_money(r.total_cost, dp),
            "display_status": _display_status(self.kind, r.status)}) for r in rows]
        posted = sum((x.total_cost for x in items if x.status == POSTED), ZERO)
        return StockDocumentListResponse.build(items, total, params.page, params.page_size,
                                               total_cost=round_money(posted, dp))

    async def get(self, business_id: str, document_id: str) -> StockDocumentResponse:
        return await self._response(await self._document(business_id, document_id))

    async def _response(self, document: Document) -> StockDocumentResponse:
        business_id = document.business_id
        dp = await self.posting.decimals(business_id)
        row = await self.repo.stock_document_row(business_id, self.kind.key, document.id)
        costs = {m.line_no: -m.amount for m in await self.repo.movements_of(business_id, document.id)
                 if m.qty_owned < 0}
        lines, cost_lines = [], []
        for x in await self.repo.stock_line_rows(business_id, document.id):
            amount = x.amount if x.item_id is None else costs.get(x.line_no)
            line = StockLineResponse.model_validate({**x._mapping, "amount": round_money(amount, dp)
                                                     if amount is not None else None})
            (lines if x.item_id else cost_lines).append(line)
        status = await self.posting.status_of(document)
        return StockDocumentResponse.model_validate({
            **row._mapping, "document_type": self.kind.key, "display_status": _display_status(self.kind, status),
            "status": status, "is_locked": await self.posting.is_locked(document), "lines": lines,
            "costs": cost_lines, "total_cost": round_money(row.total_cost, dp),
            "created_at": document.created_at, "updated_at": document.updated_at})

    # ---------------------------------------------------------------- writes
    async def create(self, ctx: BusinessContext, body) -> StockDocumentResponse:
        location, to_location = await self._locations(ctx.business_id, body)
        lines = await self._lines(ctx.business_id, body)
        document = await self.posting.create_header(ctx, self.kind.key, self.kind.area, _header(body),
                                                    POSTED if body.post else DRAFT)
        await self.repo.add(StockDocument(document_id=document.id, business_id=ctx.business_id,
                                          location_id=location, to_location_id=to_location))
        if self.kind.key == PRODUCTION:
            await self.repo.add(ProductionOrder(document_id=document.id, business_id=ctx.business_id,
                                                finished_item_id=body.finished_item_id, qty=body.qty))
        await self._store_lines(document, lines)
        if body.post:
            await self._post(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "create", self.kind.entity, document.id, ctx.business_id, after=after)
        return after

    async def update(self, ctx: BusinessContext, document_id: str, body) -> StockDocumentResponse:
        document = await self._writable(ctx, document_id, body.version)
        before = await self._response(document)
        location, to_location = await self._locations(ctx.business_id, body)
        lines = await self._lines(ctx.business_id, body)
        await self.posting.update_header(ctx, document, _header(body))
        extension = await self.repo.stock_document(ctx.business_id, document.id)
        extension.location_id, extension.to_location_id = location, to_location
        if self.kind.key == PRODUCTION:
            order = await self.repo.production(ctx.business_id, document.id)
            order.finished_item_id, order.qty = body.finished_item_id, body.qty
        await self._store_lines(document, lines)
        if before.status == POSTED:
            await self._post(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "update", self.kind.entity, document.id, ctx.business_id,
                                before=before, after=after)
        return after

    async def post(self, ctx: BusinessContext, document_id: str, version: int) -> StockDocumentResponse:
        document = await self._writable(ctx, document_id, version)
        if await self.posting.status_of(document) != DRAFT:
            raise ConflictError("Only a draft can be posted", "document_not_draft")
        before = await self._response(document)
        await self.posting.set_status(ctx, document, POSTED)
        await self._post(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "post", self.kind.entity, document.id, ctx.business_id,
                                before=before, after=after)
        return after

    async def void(self, ctx: BusinessContext, document_id: str, version: int) -> StockDocumentResponse:
        document = await self._writable(ctx, document_id, version)
        before = await self._response(document)
        await self.posting.void(ctx, document)
        if before.status == POSTED:
            await self.stock.remove(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "void", self.kind.entity, document.id, ctx.business_id,
                                before=before, after=after)
        return after

    # ---------------------------------------------------------------- stock
    async def _post(self, ctx: BusinessContext, document: Document) -> None:
        extension = await self.repo.stock_document(ctx.business_id, document.id)
        lines = [x for x in await self.repo.stock_lines(ctx.business_id, document.id) if x.item_id]
        moves = []
        for x in lines:
            if self.kind.key == TRANSFER:
                moves += [Move(x.item_id, extension.location_id, x.line_no, qty_on_hand=-x.qty),
                          Move(x.item_id, extension.to_location_id, x.line_no, qty_on_hand=x.qty)]
            else:
                moves.append(Move(x.item_id, extension.location_id, x.line_no, qty_owned=-x.qty, qty_on_hand=-x.qty))
        if self.kind.key == PRODUCTION:
            order = await self.repo.production(ctx.business_id, document.id)
            moves.append(Move(order.finished_item_id, extension.location_id, len(lines) + 1, qty_owned=order.qty,
                              qty_on_hand=order.qty))
        await self.stock.apply(ctx, document, self.kind.key, moves)

    # ---------------------------------------------------------------- validation
    async def _locations(self, business_id: str, body) -> tuple[str, str | None]:
        if self.kind.key == TRANSFER:
            ids = (body.from_location_id, body.to_location_id)
        else:
            ids = (body.location_id or (await self.repo.default_location(business_id)).id, None)
        for location_id in filter(None, ids):
            if await self.repo.location(business_id, location_id) is None:
                raise LedgerValidationError("Inventory location not found in this business", "invalid_location")
        return ids

    async def _lines(self, business_id: str, body) -> list[StockDocumentLine]:
        wanted = {x.item_id for x in body.lines}
        if self.kind.key == PRODUCTION:
            if body.finished_item_id in wanted:
                raise LedgerValidationError("The finished item cannot be one of its own materials", "invalid_item")
            wanted.add(body.finished_item_id)
        items = await self.master.items(business_id, wanted)
        if any(items.get(i) is None or items[i].item_kind_key != INVENTORY for i in wanted):
            raise LedgerValidationError("Choose inventory items of this business", "invalid_item")
        lines = [StockDocumentLine(business_id=business_id, line_no=no, item_id=x.item_id, qty=x.qty,
                                   account_id=getattr(x, "account_id", None), description=x.description)
                 for no, x in enumerate(body.lines, start=1)]
        costs = getattr(body, "costs", [])
        lines += [StockDocumentLine(business_id=business_id, line_no=len(lines) + no, account_id=x.account_id,
                                    amount=x.amount, description=x.description)
                  for no, x in enumerate(costs, start=1)]
        accounts = {x.account_id for x in lines if x.account_id}
        found = await self.master.account_types(business_id, accounts)
        if set(found) != accounts or any(not a.is_active for a in found.values()):
            raise LedgerValidationError("Choose active accounts of this business", "invalid_account")
        return lines

    async def _store_lines(self, document: Document, lines: list[StockDocumentLine]) -> None:
        for line in lines:
            line.document_id = document.id
        await self.repo.replace_stock_lines(document.business_id, document.id, lines)

    async def _document(self, business_id: str, document_id: str, *, for_update: bool = False) -> Document:
        document = None
        if is_uuid(document_id):
            document = await self.posting.get_document(business_id, document_id, self.kind.key, for_update=for_update)
        if document is None:
            raise ResourceNotFoundError(self.kind.entity, document_id)
        return document

    async def _writable(self, ctx: BusinessContext, document_id: str, version: int) -> Document:
        document = await self._document(ctx.business_id, document_id, for_update=True)
        check_version(document, version)
        if await self.posting.status_of(document) == VOID:
            raise ConflictError("A void document cannot be changed", "document_void")
        return document


def _header(body) -> DocumentHeader:
    return DocumentHeader(body.date, body.reference, body.description)
