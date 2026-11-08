"""Ledger image of invoices and notes, both sides (B4: PR-16, PR-20, PR-25, PR-29, PR-30, BUG-05;
B5: PR-38, PR-41c, PR-42, PR-43; B7: PR-18, PR-21, PR-40, PR-41a/b).

Sales invoice: Dr Accounts receivable[customer, invoice] gross total / Cr each line account net
(item dimension) / Cr each line's tax per component account (tax code and component dimensions,
one line per document line and component, T82, T54) / rounding difference to Rounding (T56); with
withholding tax, Dr WHT receivable[customer, invoice] / Cr AR[customer, invoice] (T57, T81). A
purchase invoice is the mirror on Accounts payable: Dr lines, freight-in capitalised to the
inventory lines (T77, T78) and input tax (same Tax payable account, PR-38) / Cr AP[supplier,
invoice]; WHT payable carries the supplier and invoice (PR-41a BV). A reverse-charge line posts its
tax both ways and leaves it out of the total (T55). Credit and debit notes mirror their invoice;
the control side (total after WHT) is split by the invoices they settle (named invoice or oldest
open first; closed purchase invoices are skipped, PR-41c), the rest is party credit; their WHT
goes back to the party's WHT account (T80). Amounts are read back from the database views after
the lines are stored.
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
from app.services.trade_tax import split_by_weight, split_tax
from app.services.trade_types import TradeSide

ZERO = Decimal(0)
ROUNDING = "rounding"
BLOCK = "block"
ON_HAND = "inventory_on_hand"
FREIGHT_IN = "Freight-in"
WHT_ACCOUNT = {"accounts_receivable": "wht_receivable", "accounts_payable": "wht_payable"}


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
        """Line accounts, freight-in and tax accounts on the income side (credit for an invoice)."""
        business_id = document.business_id
        rows = await self.repo.line_rows(business_id, document.id)
        taxes = await self.repo.line_taxes(business_id, document.id)
        dp = await self.posting.decimals(business_id)
        lines = []
        for row in rows:
            if row.net != 0:
                lines.append(LineInput(row.account_id, *_side(row.net, credit), row.description, item_id=row.item_id))
            for component, amount in _component_taxes(row, taxes.get(row.id, []), dp):
                lines.append(LineInput(component.account_id, *_side(amount, credit), tax_code_id=row.tax_code_id,
                                       tax_component_id=component.component_id))
                if row.tax_reverse_charge:  # PR-40: self-assessed, both sides
                    lines.append(LineInput(component.account_id, *_side(amount, not credit),
                                           tax_code_id=row.tax_code_id, tax_component_id=component.component_id))
        lines += [LineInput(account_id, *_side(amount, credit), FREIGHT_IN, item_id=item_id)
                  for account_id, item_id, amount, _ in await self.freight_parts(document, rows, dp)]
        detail = await self.repo.detail(business_id, document.id)
        if detail.rounding != 0:
            rounding = await self.coa.system_account_id(business_id, ROUNDING)
            lines.append(LineInput(rounding, *_side(detail.rounding, credit)))
        return lines

    async def freight_parts(self, document: Document, rows: list, dp: int) -> list[tuple[str, str, Decimal, int]]:
        """(Inventory on hand account, item, part, line no) per inventory line: freight-in split by line net value."""
        freight = sum((x.amount for x in await self.repo.freight_lines(document.business_id, document.id)), ZERO)
        if freight == 0:
            return []
        on_hand = await self.coa.system_account_id(document.business_id, ON_HAND)
        stocked = [r for r in rows if r.item_id and r.account_id == on_hand]
        if not stocked or sum((r.net for r in stocked), ZERO) <= 0:
            raise LedgerValidationError("Freight-in needs at least one inventory item line", "freight_needs_inventory")
        parts = split_by_weight(freight, [r.net for r in stocked], dp)
        return [(on_hand, r.item_id, part, r.line_no) for r, part in zip(stocked, parts) if part != 0]

    async def _wht_lines(self, side: TradeSide, document: Document, party_id: str, amount: Decimal,
                         control_credit: bool, invoice_id: str | None) -> list[LineInput]:
        """WHT sits on the control account's side: receivable for sales, payable for purchases."""
        if amount == 0:
            return []
        account = await self.coa.system_account_id(document.business_id, WHT_ACCOUNT[side.control])
        return [LineInput(account, *_side(amount, control_credit), party_id=party_id, invoice_document_id=invoice_id)]

    async def invoice_lines(self, side: TradeSide, document: Document, party_id: str) -> list[LineInput]:
        await self._positive_total(document)
        detail = await self.repo.detail(document.business_id, document.id)
        control = await self.coa.system_account_id(document.business_id, side.control)
        control_credit = side.lines_credit is False
        lines = [LineInput(control, *_side(detail.gross_total, control_credit), party_id=party_id,
                           invoice_document_id=document.id),
                 *await self._income_lines(document, credit=side.lines_credit)]
        if detail.withholding_tax != 0:
            lines += [*await self._wht_lines(side, document, party_id, detail.withholding_tax, control_credit,
                                             document.id),
                      LineInput(control, *_side(detail.withholding_tax, not control_credit), party_id=party_id,
                                invoice_document_id=document.id)]
        return lines

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
        detail = await self.repo.detail(document.business_id, document.id)
        lines += await self._wht_lines(side, document, party_id, detail.withholding_tax, control_credit, invoice_id)
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


class _Snapshot:
    def __init__(self, account_id: str, component_id: str | None, rate: Decimal) -> None:
        self.account_id, self.component_id, self.rate = account_id, component_id, rate


def _component_taxes(row, components: list, dp: int) -> list[tuple]:
    """(component snapshot, amount) for a line's tax (or its self-assessed tax), zero parts left out."""
    tax = row.self_assessed_tax if row.tax_reverse_charge else row.tax
    if tax == 0:
        return []
    if not components:  # a line stored without component snapshots posts to its tax account snapshot
        components = [_Snapshot(row.tax_account_id, None, row.tax_rate)]
    return [(c, amount) for c, amount in zip(components, split_tax(tax, [c.rate for c in components], dp))
            if amount != 0]
