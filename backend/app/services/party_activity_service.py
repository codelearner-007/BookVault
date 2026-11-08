"""Customer / supplier activity: billed and settled totals for the lists, and the party's transactions.

Balance stays the AR / AP balance (ledger); billed and settled are plain sums of posted documents, so a
receipt posted to a non-AR account counts as received without moving the balance.

Transactions: receipts are money in and payments money out; every other document reads its effect
on the party's control account (a credit is in: a credit note, a supplier bill; a debit is out: an
invoice, a debit note). The running balance is the AR balance (customers) or AP balance (suppliers,
credit positive) after each document.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.money import round_money
from app.core.pagination import PageParams
from app.repositories.party_activity_repository import PartyActivityRepository
from app.schemas.response.sales import CustomerTransaction, CustomerTransactionsResponse
from app.services.trade_types import (
    CREDIT_NOTE,
    DEBIT_NOTE,
    INVOICE,
    PURCHASE_INVOICE,
    PURCHASES,
    SALES,
    TradeSide,
)

ZERO = Decimal(0)
RECEIPT, PAYMENT = "receipt", "payment"
WHT_RECEIPT, LATE_FEE = "withholding_tax_receipt", "late_payment_fee"


@dataclass(frozen=True)
class _Party:
    table: str
    invoice: str
    note: str
    direction: str  # cash direction that settles the party
    sign: int  # balance = sign x (debit - credit) on the control account


_PARTIES = {
    SALES.key: _Party("customers", INVOICE, CREDIT_NOTE, RECEIPT, 1),
    PURCHASES.key: _Party("suppliers", PURCHASE_INVOICE, DEBIT_NOTE, PAYMENT, -1),
}


@dataclass(frozen=True)
class PartyTotals:
    billed: Decimal
    settled: Decimal


def _in_out(row) -> tuple[Decimal, Decimal]:
    if row.cash is not None and row.direction == RECEIPT:
        return row.cash, ZERO
    if row.cash is not None and row.direction == PAYMENT:
        return ZERO, row.cash
    return (-row.delta, ZERO) if row.delta < 0 else (ZERO, row.delta)


class PartyActivityService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = PartyActivityRepository(session)

    async def totals(self, business_id: str, side: TradeSide, dp: int) -> dict[str, PartyTotals]:
        """Per party of the side, in one query (rows the user may not view are not counted)."""
        party = _PARTIES[side.key]
        rows = await self.repo.totals(business_id, party.table, party.invoice, party.note, party.direction, dp)
        return {pid: PartyTotals(round_money(r.billed, dp), round_money(r.settled, dp)) for pid, r in rows.items()}

    async def transactions(self, business_id: str, party_id: str, side: TradeSide, dp: int,
                           date_from: date | None, date_to: date | None,
                           params: PageParams) -> CustomerTransactionsResponse:
        party = _PARTIES[side.key]
        types = [party.invoice, party.note, RECEIPT, PAYMENT, WHT_RECEIPT, LATE_FEE]
        rows, total = await self.repo.activity(business_id, party_id, side.control, types, dp,
                                               date_from, date_to, params.offset, params.page_size)
        items = []
        for row in rows:
            amount_in, amount_out = _in_out(row)
            items.append(CustomerTransaction(
                document_id=row.document_id, document_type=row.document_type, date=row.date,
                reference=row.reference, description=row.description,
                amount_in=round_money(amount_in, dp), amount_out=round_money(amount_out, dp),
                balance=round_money(party.sign * row.running, dp)))
        return CustomerTransactionsResponse.build(items, total, params.page, params.page_size)
