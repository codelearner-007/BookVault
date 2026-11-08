"""Stock ledger (B6): the only writer of stock_movements, and the cost entries they drive.

A posted document states what it moves (owned and on-hand quantities per item and location; fixed
values for purchases, debit notes and starting balances). `apply` replaces its movements, re-costs
every item it touches at moving average over the whole history in date order (stock_costing),
posts the document's cost entry (sales invoices and credit notes: a separate COGS entry, BV-01;
write-offs and production orders: their only entry) and, when a back-dated change moved the cost
of a later document, re-posts that document's cost entry as reversal + new entry and logs the
correction (PR-69). Negative owned stock is rejected (409 insufficient_stock, CD-16).
"""

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.models.inventory import InventoryCostCorrection, StockMovement
from app.models.ledger import Document
from app.repositories.coa_repository import CoaRepository
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.master_data_repository import MasterDataRepository
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.posting import SOURCE_COGS, SOURCE_DOCUMENT, LineInput, PostingService
from app.services.stock_costing import DERIVED, RETURN, InsufficientStock, OwnedMove, cost, rule_of

ZERO = Decimal(0)
ON_HAND, COST, WRITE_OFFS = "inventory_on_hand", "inventory_cost", "inventory_write_offs"
COGS_TYPES = {"sales_invoice", "credit_note"}  # cost entry separate from the document entry
STOCK_ENTRY_TYPES = {"inventory_write_off", "production_order"}  # the cost entry is the document entry
MAX_ROUNDS = 25  # production chains re-cost their finished items; a cycle never settles


@dataclass(frozen=True)
class Move:
    """What one document line moves at one location (amount: fixed values only)."""

    item_id: str
    location_id: str
    line_no: int
    qty_owned: Decimal = ZERO
    qty_on_hand: Decimal = ZERO
    amount: Decimal = ZERO


class StockLedger:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = InventoryRepository(session)
        self.posting = PostingService(session)
        self.coa = CoaRepository(session)
        self.master = MasterDataRepository(session)
        self.audit = AuditService(session)

    # ---------------------------------------------------------------- public
    async def apply(self, ctx: BusinessContext, document: Document, type_key: str, moves: list[Move]) -> None:
        """Replace the document's movements, re-cost and (re)post every cost entry that moved."""
        touched = await self.repo.delete_movements(ctx.business_id, document.id)
        rows = [StockMovement(business_id=ctx.business_id, document_id=document.id, item_id=m.item_id,
                              location_id=m.location_id, line_no=m.line_no, qty_owned=m.qty_owned,
                              qty_on_hand=m.qty_on_hand, amount=m.amount if m.qty_owned else ZERO)
                 for m in moves if m.qty_owned or m.qty_on_hand]
        await self.repo.add_all(rows)
        touched |= {r.item_id for r in rows if r.qty_owned != 0}
        changed = await self._recost(ctx.business_id, touched)
        await self._sync_cost_entry(ctx, document, type_key)
        await self._repost_changed(ctx, document, changed - {document.id})

    async def remove(self, ctx: BusinessContext, document: Document, *, recost: bool = True) -> None:
        """A voided document's movements go; later documents are re-costed (its entries are already reversed).
        recost=False: a replacement document posted next in the same transaction re-costs (starting balances)."""
        touched = await self.repo.delete_movements(ctx.business_id, document.id)
        if not recost:
            return
        changed = await self._recost(ctx.business_id, touched)
        await self._repost_changed(ctx, document, changed - {document.id})

    # ---------------------------------------------------------------- costing
    async def _recost(self, business_id: str, items: set[str]) -> set[str]:
        """Re-cost the items (and finished items whose inputs moved); returns the documents whose values changed."""
        dp = await self.posting.decimals(business_id)
        queue, changed, rounds = set(items), set(), 0
        while queue:
            rounds += 1
            if rounds > MAX_ROUNDS * max(len(items), 1):
                raise ConflictError("The production orders of these items depend on each other", "cost_cycle")
            item_id = queue.pop()
            moves = [OwnedMove(**r._mapping) for r in await self.repo.owned_moves(business_id, item_id)]
            notes = await self.repo.note_invoices(business_id, [m.document_id for m in moves if rule_of(m) == RETURN])
            derived = await self.repo.production_values(
                business_id, [m.document_id for m in moves if rule_of(m) == DERIVED])
            by_document: dict[str, list[str]] = {}
            for m in moves:
                by_document.setdefault(m.document_id, []).append(m.id)
            try:
                amounts = cost(moves, dp, return_sources={
                    m.id: by_document.get(notes[m.document_id], []) for m in moves if m.document_id in notes},
                    derived={m.id: derived[m.document_id] for m in moves if m.document_id in derived})
            except InsufficientStock as exc:
                raise await self._insufficient(business_id, item_id, exc.move.location_id) from exc
            for move in moves:
                if amounts[move.id] != move.amount:
                    await self.repo.set_amount(business_id, move.id, amounts[move.id])
                    changed.add(move.document_id)
                    if move.type_key == "production_order" and move.qty < 0:
                        queue |= await self._finished_items(business_id, move.document_id)
        await self.repo.save()
        return changed

    async def _finished_items(self, business_id: str, document_id: str) -> set[str]:
        order = await self.repo.production(business_id, document_id)
        return {order.finished_item_id} if order else set()

    async def _insufficient(self, business_id: str, item_id: str, location_id: str) -> ConflictError:
        item = (await self.master.items(business_id, {item_id}))[item_id]
        location = (await self.repo.location_names(business_id)).get(location_id, "")
        name = f"{item.code} {item.name}" if item.code else item.name
        error = ConflictError(f"Insufficient stock for {name} at {location}", "insufficient_stock")
        error.details.update(item_id=item_id, location_id=location_id)
        return error

    # ---------------------------------------------------------------- cost entries
    async def _sync_cost_entry(self, ctx: BusinessContext, document: Document, type_key: str) -> Decimal:
        """Reverse the document's live cost entry and post the one its movements now give; returns its total."""
        if type_key not in COGS_TYPES | STOCK_ENTRY_TYPES:
            return ZERO
        cogs = type_key in COGS_TYPES
        await self.posting.reverse_live_entry(ctx, document, cogs=cogs)
        lines = await self._cost_lines(ctx.business_id, document, type_key)
        if lines:
            await self.posting.post_lines(ctx, document, lines, SOURCE_COGS if cogs else SOURCE_DOCUMENT)
        return sum((x.debit for x in lines), ZERO)

    async def _cost_lines(self, business_id: str, document: Document, type_key: str) -> list[LineInput]:
        moves = [m for m in await self.repo.movements_of(business_id, document.id) if m.amount != 0]
        on_hand = await self.coa.system_account_id(business_id, ON_HAND)
        if type_key == "production_order":
            lines = [_stock_line(on_hand, m) for m in moves]
            lines += [LineInput(x.account_id, ZERO, x.amount, x.description)
                      for x in await self.repo.stock_lines(business_id, document.id) if x.amount]
            return lines
        other = await self._other_accounts(business_id, document, type_key, moves)
        lines = []
        for m in moves:  # debit first: Dr cost / Cr Inventory on hand (a return: the other way round)
            lines += sorted([_stock_line(on_hand, m), LineInput(other[m.id], *_side(-m.amount))],
                            key=lambda x: x.debit == 0)
        return lines

    async def _other_accounts(self, business_id: str, document: Document, type_key: str,
                              moves: list) -> dict[str, str]:
        """The account opposite Inventory on hand: the item's cost account, or a write-off line's account."""
        if type_key == "inventory_write_off":
            default = await self.coa.system_account_id(business_id, WRITE_OFFS)
            by_line = {x.line_no: x.account_id for x in await self.repo.stock_lines(business_id, document.id)}
            return {m.id: by_line.get(m.line_no) or default for m in moves}
        default = await self.coa.system_account_id(business_id, COST)
        items = await self.master.items(business_id, {m.item_id for m in moves})
        return {m.id: items[m.item_id].expense_account_id or default for m in moves}

    async def _repost_changed(self, ctx: BusinessContext, cause: Document, document_ids: set[str]) -> None:
        """PR-69: later documents whose cost moved are re-posted (reversal + new entry), logged and audited."""
        for document_id in sorted(document_ids):
            document = await self.posting.repo.get_document(ctx.business_id, document_id, for_update=True)
            if not await self.repo.has_write(ctx.business_id, document.area_key):
                raise ConflictError("This change re-costs later documents you cannot edit",
                                    "cost_correction_not_allowed")
            type_key = await self.posting.repo.document_type_key(document.document_type_id)
            cogs = type_key in COGS_TYPES
            old = sum((x.debit for x in await self.posting.live_lines(document, cogs=cogs)), ZERO)
            new = await self._sync_cost_entry(ctx, document, type_key)
            await self.repo.add_correction(InventoryCostCorrection(
                business_id=ctx.business_id, document_id=document.id, caused_by_document_id=cause.id,
                old_amount=old, new_amount=new, created_by=ctx.user_id))
            await self.audit.record(ctx.user_id, "cost_correction", "Document", document.id, ctx.business_id,
                                    before={"cost": str(old)}, after={"cost": str(new)},
                                    details={"caused_by_document_id": cause.id})


def _side(amount: Decimal) -> tuple[Decimal, Decimal]:
    """(debit, credit) of a signed amount."""
    return (amount, ZERO) if amount > 0 else (ZERO, -amount)


def _stock_line(on_hand: str, move) -> LineInput:
    return LineInput(on_hand, *_side(move.amount), item_id=move.item_id)
