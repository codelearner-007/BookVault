"""Stock side of trade documents (B6; PR-23, PR-26, PR-37, PR-39, PR-42, PR-44).

What a posted invoice, note, delivery note or goods receipt moves: owned qty for invoices and notes
(purchases and debit notes at their line net, plus the freight-in capitalised to the line, PR-41b), on-hand qty for delivery notes, goods receipts and
documents that "also act as" one; a kit moves its components. Inventory items and kits sell to their
custom income account (else Inventory - sales) and are bought into Inventory on hand, always.
"""

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import LedgerValidationError
from app.models.ledger import Document
from app.repositories.coa_repository import CoaRepository
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.master_data_repository import MasterDataRepository
from app.repositories.sales_repository import SalesRepository
from app.services.access_service import BusinessContext
from app.services.posting import PostingService
from app.services.stock_ledger import Move, StockLedger
from app.services.trade_ledger import TradeLedger
from app.services.trade_types import ROLE_INVOICE, ROLE_NOTE, ROLE_STOCK, SALES, TradeType, moves_inbound

NON_INVENTORY, KIT = "non_inventory", "kit"
ON_HAND, INVENTORY_SALES = "inventory_on_hand", "inventory_sales"
STOCK_ROLES = (ROLE_INVOICE, ROLE_NOTE, ROLE_STOCK)
ZERO = Decimal(0)


class TradeStock:
    def __init__(self, session: AsyncSession, kind: TradeType) -> None:
        self.kind = kind
        self.repo = SalesRepository(session)
        self.master = MasterDataRepository(session)
        self.inventory = InventoryRepository(session)
        self.coa = CoaRepository(session)
        self.ledger = StockLedger(session)
        self.posting = PostingService(session)
        self.trade_ledger = TradeLedger(self.repo, self.posting, self.coa)

    async def line_account(self, business_id: str, line, item) -> str | None:
        """Non-inventory items name their account; inventory items and kits as in the module docstring."""
        side = self.kind.side
        if item is None or item.item_kind_key == NON_INVENTORY:
            return line.account_id or (getattr(item, side.line_account) if item else None)
        if side is not SALES:
            if item.item_kind_key == KIT:
                raise LedgerValidationError("A kit can only be sold", "kit_not_purchasable")
            return await self.coa.system_account_id(business_id, ON_HAND)
        return line.account_id or item.income_account_id or await self.coa.system_account_id(
            business_id, INVENTORY_SALES)

    async def check_location(self, business_id: str, body) -> None:
        location_id = getattr(body, "location_id", None)
        if location_id and await self.inventory.location(business_id, location_id) is None:
            raise LedgerValidationError("Inventory location not found in this business", "invalid_location")

    async def apply(self, ctx: BusinessContext, document: Document) -> None:
        """Replace the posted document's stock movements (and its COGS entry) by what it moves now."""
        if self.kind.role in STOCK_ROLES:
            await self.ledger.apply(ctx, document, self.kind.key, await self._moves(ctx.business_id, document))

    async def remove(self, ctx: BusinessContext, document: Document) -> None:
        if self.kind.role in STOCK_ROLES:
            await self.ledger.remove(ctx, document)

    async def _moves(self, business_id: str, document: Document) -> list[Move]:
        extension = await self.repo.get(business_id, document.id)
        if self.kind.role == ROLE_INVOICE and (await self.repo.terms(business_id, document.id)).is_starting_balance:
            return []  # PR-61: a starting-balance invoice posts no COGS; its stock is an inventory starting balance
        rows = await self.repo.line_rows(business_id, document.id)
        items = await self.master.items(business_id, {r.item_id for r in rows if r.item_id})
        kits = await self.inventory.components(business_id, [k for k, x in items.items() if x.item_kind_key == KIT])
        location = extension.location_id or (await self.inventory.default_location(business_id)).id
        sign = 1 if moves_inbound(self.kind) else -1
        owned = self.kind.role != ROLE_STOCK
        on_hand = self.kind.role == ROLE_STOCK or extension.acts_as_stock_movement
        fixed = self.kind.side is not SALES and owned
        freight = {}
        if fixed:  # PR-41b: freight-in raises the cost of the inventory lines it is capitalised to
            dp = await self.posting.decimals(business_id)
            freight = {no: part for _, _, part, no in await self.trade_ledger.freight_parts(document, rows, dp)}
        moves = []
        for row in rows:
            item = items.get(row.item_id)
            if item is None or item.item_kind_key == NON_INVENTORY:
                continue
            qty = row.qty or Decimal(1)
            parts = [(c.item_id, c.qty * qty) for c in kits[item.id]] if item.item_kind_key == KIT else [(item.id, qty)]
            for item_id, part in parts:
                moved = sign * part
                moves.append(Move(item_id, location, row.line_no, qty_owned=moved if owned else ZERO,
                                  qty_on_hand=moved if on_hand else ZERO, amount=sign * (row.net + freight.get(row.line_no, ZERO)) if fixed else ZERO))
        return moves
