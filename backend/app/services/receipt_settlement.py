"""Receipts against sales invoices (B4) and payments against purchase invoices (B5)
(PR-02, PR-03, PR-22 BV, BUG-07, PR-41c, PR-64).

A receipt's Accounts receivable line settles one named invoice of its customer, or the
customer's open invoices oldest first ("Automatic"); a payment's Accounts payable line does the
same with the supplier's purchase invoices (closed invoices are never matched, PR-41c). A
receipt dated within an invoice's early-payment window that covers balance due - discount
settles it in full and posts Dr Early payment discount (sales only). What is left is party
credit (no invoice dimension). Allocations are stored at posting and replaced on repost.
"""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import LedgerValidationError
from app.models.ledger import Document
from app.repositories.coa_repository import CoaRepository
from app.repositories.sales_repository import SalesRepository
from app.services.access_service import BusinessContext
from app.services.posting import Allocation, LineInput, PostingService
from app.services.sales_rules import allocate
from app.services.trade_types import PURCHASES, SALES

ZERO = Decimal(0)
EARLY_DISCOUNT = "early_payment_discount"
RECEIPT = "receipt"


class ReceiptSettlement:
    def __init__(self, session: AsyncSession, direction: str = RECEIPT) -> None:
        self.side = SALES if direction == RECEIPT else PURCHASES
        self.sales = SalesRepository(session)
        self.coa = CoaRepository(session)
        self.posting = PostingService(session)

    async def control_account(self, business_id: str) -> str | None:
        """Accounts receivable on a receipt, Accounts payable on a payment."""
        return await self.coa.system_account_id(business_id, self.side.control)

    def _settling(self, line: LineInput) -> bool:
        return line.credit > 0 if self.side is SALES else line.debit > 0

    async def _open_invoices(self, business_id: str, party_id: str) -> list:
        rows = await self.sales.balances(business_id, party_id=party_id, type_key=self.side.invoice)
        return [SimpleNamespace(**r._mapping) for r in rows if not r.is_closed]

    async def settle(self, ctx: BusinessContext, document: Document, on: date, lines: list, amounts: list[Decimal],
                     ledger: list[LineInput]) -> tuple[list[LineInput], list[Allocation]]:
        """Replace each settling control-account line of the ledger image by its per-invoice split."""
        control = await self.control_account(ctx.business_id)
        settling = [(x, a) for x, a in zip(lines, amounts) if x.account_id == control and a > 0]
        await self.posting.replace_allocations(ctx, document, [])
        if not settling:
            return ledger, []
        dp = await self.posting.decimals(ctx.business_id)
        sales = self.side is SALES
        discount_account = await self.coa.system_account_id(ctx.business_id, EARLY_DISCOUNT) if sales else None
        open_by_party: dict[str, list] = {}
        split, allocations = [], []
        for line, amount in settling:
            if line.party_id not in open_by_party:
                open_by_party[line.party_id] = await self._open_invoices(ctx.business_id, line.party_id)
            invoices = open_by_party[line.party_id]
            if line.invoice_document_id:
                invoices = [x for x in invoices if x.invoice_id == line.invoice_document_id]
                if not invoices:
                    raise LedgerValidationError(f"The invoice is not an open invoice of this {self.side.party_kind}",
                                                "invalid_invoice")
            found, rest = allocate(invoices, amount, on, dp, with_discount=sales)
            for a in found:
                next(x for x in invoices if x.invoice_id == a.invoice_document_id).balance_due -= \
                    a.amount + a.early_discount
                split.append(self._line(control, a.amount + a.early_discount, line, a.invoice_document_id))
                if a.early_discount > 0:
                    split.append(LineInput(discount_account, a.early_discount, ZERO, party_id=None))
            if rest > 0:
                split.append(self._line(control, rest, line, None))
            allocations.extend(found)
        kept = [x for x in ledger if not (x.account_id == control and self._settling(x))]
        return [*kept, *split], allocations

    def _line(self, control: str, amount: Decimal, line, invoice_id: str | None) -> LineInput:
        debit, credit = (ZERO, amount) if self.side is SALES else (amount, ZERO)
        return LineInput(control, debit, credit, line.description, party_id=line.party_id,
                         invoice_document_id=invoice_id)
