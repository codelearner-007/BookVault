"""Receipt and payment responses (money as decimal strings; every amount computed by the server)."""

from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.common import MoneyOut, PaginatedResponse


class CashLineResponse(BaseModel):
    id: str
    line_no: int
    account_id: str | None
    account_code: str | None
    account_name: str | None
    party_id: str | None
    party_name: str | None
    description: str | None
    qty: MoneyOut | None
    unit_price: MoneyOut
    discount: MoneyOut | None
    amount: MoneyOut


class CashTransactionResponse(BaseModel):
    id: str
    direction: str
    reference: str | None
    date: date
    status: str
    version: int
    is_locked: bool
    bank_account_id: str | None
    bank_account_name: str | None
    bank_can_have_pending: bool
    counterparty_party_id: str | None
    counterparty_kind: str | None
    counterparty_name: str | None
    counterparty: str | None
    description: str | None
    clears_later: bool
    cleared_on: date | None
    is_pending: bool
    lines: list[CashLineResponse]
    total: MoneyOut
    created_at: datetime
    updated_at: datetime


class CashTransactionListItem(BaseModel):
    id: str
    reference: str | None
    date: date
    status: str
    bank_account_id: str | None
    bank_account_name: str | None
    description: str | None
    counterparty: str | None
    amount: MoneyOut
    is_pending: bool
    version: int


class CashTransactionListResponse(PaginatedResponse[CashTransactionListItem]):
    total_amount: MoneyOut


class LineAmountResponse(BaseModel):
    amount: MoneyOut


class CashTotalsResponse(BaseModel):
    lines: list[LineAmountResponse]
    total: MoneyOut


class CashLineReportItem(BaseModel):
    document_id: str
    date: date
    reference: str | None
    bank_account_name: str | None
    counterparty: str | None
    account_name: str | None
    description: str | None
    qty: MoneyOut | None
    unit_price: MoneyOut
    discount: MoneyOut | None
    amount: MoneyOut


class CashLineReportResponse(PaginatedResponse[CashLineReportItem]):
    pass
