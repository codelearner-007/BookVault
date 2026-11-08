"""Ledger image of invoices and notes, both sides (B4: PR-16, PR-20, PR-25, PR-29, PR-30, BUG-05;
B5: PR-38, PR-41c, PR-42, PR-43).

Sales invoice: Dr Accounts receivable[customer, invoice] total / Cr each line account net (item
dimension) / Cr each line's tax account tax (tax code dimension, one line per document line,
T82) / rounding difference to Rounding (T56). A purchase invoice is the mirror on Accounts
payable: Dr lines and input tax (same Tax payable account, PR-38) / Cr AP[supplier, invoice].
Credit and debit notes mirror their invoice; the control side is split by the invoices they
settle (named invoice or oldest open first; closed purchase invoices are skipped, PR-41c), the
rest is party credit. Amounts are read back from the database views after the lines are stored.
"""

from decimal import Decimal

from app.core.exceptions import AppException, ConflictError, LedgerValidationError
from app.core.money import round_money
from app.models.customer import Customer
from app.models.ledger import Document
from app.repositories.coa_repository import CoaRepository
from app.repositories.sales_repository import SalesRepository
from app.schemas.response.sales import DocumentWarning
from app.services.posting import Allocation, LineInput, PostingService
from app.services.sales_rules import allocate
from app.services.trade_types import TradeSide

ZERO = Decimal(0)
ROUNDING = "rounding"
BLOCK = "block"


def _side(amount: Decimal, credit: bool) -> tuple[Decimal, Decimal]:
    """(debit, credit) for an amount meant for one side; a negative amount goes to the other."""
    if (amount > 0) == credit:
        return ZERO, abs(amount)
    return abs(amount), ZERO


class TradeLedger:
    def __init__(self, repo: SalesRepository, posting: PostingService, coa: CoaRepository) -> None:
        self.repo = repo
        self.posting = posting
        self.coa = coa

    async def total(self, document: Document) -> Decimal:
        return (await self.repo.detail(document.business_id, document.id)).total

    async def _income_lines(self, document: Document, credit: bool) -> list[LineInput]:
        """Line accounts and tax accounts on the income side (credit for an invoice)."""
        lines = []
        for row in await self.repo.line_rows(document.business_id, document.id):
            if row.net != 0:
                lines.append(LineInput(row.account_id, *_side(row.net, credit), row.description, item_id=row.item_id))
            if row.tax != 0:
                lines.append(LineInput(row.tax_account_id, *_side(row.tax, credit), tax_code_id=row.tax_code_id))
        detail = await self.repo.detail(document.business_id, document.id)
        if detail.rounding != 0:
            rounding = await self.coa.system_account_id(document.business_id, ROUNDING)
            lines.append(LineInput(rounding, *_side(detail.rounding, credit)))
        return lines

    async def invoice_lines(self, side: TradeSide, document: Document, party_id: str) -> list[LineInput]:
        total = await self._positive_total(document)
        control = await self.coa.system_account_id(document.business_id, side.control)
        return [LineInput(control, *_side(total, side.lines_credit is False), party_id=party_id,
                          invoice_document_id=document.id),
                *await self._income_lines(document, credit=side.lines_credit)]

    async def note(self, side: TradeSide, document: Document, party_id: str, invoice_id: str | None,
                   dp: int) -> tuple[list[LineInput], list[Allocation]]:
        """The credit / debit note's lines and the invoices it settles (stored allocations, PR-30, PR-43, PR-64)."""
        total = await self._positive_total(document)
        invoices = [x for x in await self.repo.balances(document.business_id, party_id=party_id, type_key=side.invoice)
                    if not x.is_closed]
        if invoice_id is not None:
            invoices = [x for x in invoices if x.invoice_id == invoice_id]
            if not invoices:
                raise LedgerValidationError("The invoice is not an open invoice of this party", "invalid_invoice")
        allocations, rest = allocate(invoices, total, document.document_date, dp, with_discount=False)
        control = await self.coa.system_account_id(document.business_id, side.control)
        control_credit = side.lines_credit  # the note's control side = the invoice's lines side
        lines = [LineInput(control, *_side(a.amount, control_credit), party_id=party_id,
                           invoice_document_id=a.invoice_document_id) for a in allocations]
        if rest > 0:
            lines.append(LineInput(control, *_side(rest, control_credit), party_id=party_id))
        return [*await self._income_lines(document, credit=not side.lines_credit), *lines], allocations

    async def _positive_total(self, document: Document) -> Decimal:
        total = await self.total(document)
        if total <= 0:
            raise LedgerValidationError("The total must be more than zero", "total_not_positive")
        return total

    async def check_credit_limit(self, customer: Customer, document: Document, policy: str, override: bool,
                                 dp: int) -> list[DocumentWarning]:
        """BUG-05: available credit = limit - AR balance (this invoice's current posting excluded)."""
        if customer.credit_limit is None:
            return []
        current = sum((x.debit - x.credit for x in await self.posting.live_lines(document)
                       if x.party_id == customer.id), ZERO)
        balance = await self.repo.ar_balance(document.business_id, customer.id) - current
        available = round_money(customer.credit_limit - balance, dp)
        total = await self.total(document)
        if total <= available:
            return []
        details = {"credit_limit": str(round_money(customer.credit_limit, dp)), "available_credit": str(available),
                   "invoice_total": str(round_money(total, dp))}
        if policy == BLOCK:
            error = ConflictError("This invoice is over the customer's credit limit", "credit_limit_exceeded")
            error.details.update(details)
            raise error
        if not override:
            raise AppException("This invoice is over the customer's credit limit. Confirm to post it anyway.",
                               status_code=409, details={"code": "credit_limit_warning", **details})
        return [DocumentWarning(code="credit_limit_exceeded",
                                message=f"Posted over the credit limit (available credit {available})")]
