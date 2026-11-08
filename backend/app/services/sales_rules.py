"""Sales rules shared by invoices, credit notes, receipts and the lists (B4, pure functions).

* Allocation (PR-02, PR-30, PR-64): a settling amount goes to one named invoice, or oldest
  open invoice first ("Automatic"); what is left is customer credit (PR-03).
* Early-payment discount (PR-22 BV, BUG-07): a receipt dated within the window that covers
  the balance due minus the discount settles the invoice in full; discount = rate x total.
* Statuses are derived, never stored (domain-model §6).
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from app.core.money import round_money
from app.services.posting import Allocation

ZERO = Decimal(0)
HUNDRED = Decimal(100)


@dataclass(frozen=True)
class EarlyDiscount:
    amount: Decimal
    until: date


def early_discount(invoice, on: date, dp: int) -> EarlyDiscount | None:
    """The discount a payment dated `on` would earn on this invoice balance row, if any."""
    if invoice.early_discount_rate is None or invoice.balance_due <= 0:
        return None
    until = invoice.document_date + timedelta(days=invoice.early_discount_days)
    amount = round_money(invoice.total * invoice.early_discount_rate / HUNDRED, dp)
    if on > until or amount <= 0 or invoice.balance_due <= amount:
        return None
    return EarlyDiscount(amount, until)


def allocate(invoices: list, amount: Decimal, on: date, dp: int, *,
             with_discount: bool) -> tuple[list[Allocation], Decimal]:
    """Spread `amount` over the invoices in order; returns the allocations and the remainder."""
    allocations, remaining = [], amount
    for invoice in invoices:
        if remaining <= 0:
            break
        if invoice.balance_due <= 0:
            continue
        offer = early_discount(invoice, on, dp) if with_discount else None
        discount = offer.amount if offer else ZERO
        needed = invoice.balance_due - discount
        if remaining >= needed:
            allocations.append(Allocation(invoice.invoice_id, needed, discount))
            remaining -= needed
        else:
            allocations.append(Allocation(invoice.invoice_id, remaining))
            remaining = ZERO
    return allocations, remaining


def invoice_display_status(status: str, balance_due: Decimal | None, due_date: date | None, today: date) -> str:
    if status != "posted":
        return status
    if balance_due is not None and balance_due <= 0:
        return "paid"
    return "overdue" if due_date is not None and due_date < today else "unpaid"


def customer_status(ar_balance: Decimal, has_history: bool) -> str | None:
    if ar_balance > 0:
        return "unpaid"
    if ar_balance < 0:
        return "credit"
    return "paid" if has_history else None
