"""Receipts against invoices (B4; PR-02, PR-03, PR-22 BV, BUG-07, PR-64).

An Accounts receivable line of a receipt settles one named invoice of its customer, or the
customer's open invoices oldest first ("Automatic"). A receipt dated within an invoice's
early-payment window that covers balance due - discount settles it in full and posts
Dr Early payment discount. What is left is customer credit (Cr AR[customer], no invoice).
Allocations are stored at posting and replaced when the receipt is reposted.
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

ZERO = Decimal(0)
AR, EARLY_DISCOUNT = "accounts_receivable", "early_payment_discount"


class ReceiptSettlement:
    def __init__(self, session: AsyncSession) -> None:
        self.sales = SalesRepository(session)
        self.coa = CoaRepository(session)
        self.posting = PostingService(session)

    async def receivable_account(self, business_id: str) -> str | None:
        return await self.coa.system_account_id(business_id, AR)

    async def settle(self, ctx: BusinessContext, document: Document, on: date, lines: list, amounts: list[Decimal],
                     ledger: list[LineInput]) -> tuple[list[LineInput], list[Allocation]]:
        """Replace each AR credit line of the ledger image by its per-invoice split."""
        ar = await self.receivable_account(ctx.business_id)
        receivables = [(x, a) for x, a in zip(lines, amounts) if x.account_id == ar and a > 0]
        await self.posting.replace_allocations(ctx, document, [])
        if not receivables:
            return ledger, []
        dp = await self.posting.decimals(ctx.business_id)
        discount_account = await self.coa.system_account_id(ctx.business_id, EARLY_DISCOUNT)
        open_by_party: dict[str, list] = {}
        split, allocations = [], []
        for line, amount in receivables:
            if line.party_id not in open_by_party:
                open_by_party[line.party_id] = [SimpleNamespace(**r._mapping) for r in await self.sales.balances(
                    ctx.business_id, party_id=line.party_id)]
            invoices = open_by_party[line.party_id]
            if line.invoice_document_id:
                invoices = [x for x in invoices if x.invoice_id == line.invoice_document_id]
                if not invoices:
                    raise LedgerValidationError("The invoice is not an open invoice of this customer",
                                                "invalid_invoice")
            found, rest = allocate(invoices, amount, on, dp, with_discount=True)
            for a in found:
                next(x for x in invoices if x.invoice_id == a.invoice_document_id).balance_due -= \
                    a.amount + a.early_discount
                split.append(LineInput(ar, ZERO, a.amount + a.early_discount, line.description,
                                       party_id=line.party_id, invoice_document_id=a.invoice_document_id))
                if a.early_discount > 0:
                    split.append(LineInput(discount_account, a.early_discount, ZERO, party_id=None))
            if rest > 0:
                split.append(LineInput(ar, ZERO, rest, line.description, party_id=line.party_id))
            allocations.extend(found)
        kept = [x for x in ledger if not (x.account_id == ar and x.credit > 0)]
        return [*kept, *split], allocations
