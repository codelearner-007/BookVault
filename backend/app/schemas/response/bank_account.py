"""Bank and cash account responses: balances from the ledger (PR-12 columns)."""

from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.common import MoneyOut, PaginatedResponse


class BankBalances(BaseModel):
    """cleared + pending deposits + pending withdrawals (negative) = actual."""

    cleared_balance: MoneyOut
    pending_deposits: MoneyOut
    pending_withdrawals: MoneyOut
    actual_balance: MoneyOut


class BankAccountResponse(BankBalances):
    id: str
    name: str
    code: str | None
    description: str | None
    can_have_pending: bool
    is_inactive: bool
    version: int
    created_at: datetime
    updated_at: datetime


class BankAccountListResponse(PaginatedResponse[BankAccountResponse]):
    totals: BankBalances


class BankTransactionItem(BaseModel):
    document_id: str
    document_type: str
    date: date
    reference: str | None
    description: str | None
    amount: MoneyOut
    is_pending: bool


class BankTransactionListResponse(PaginatedResponse[BankTransactionItem]):
    pass
