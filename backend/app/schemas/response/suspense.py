"""Suspense response schemas (money as decimal strings)."""

from datetime import date

from pydantic import BaseModel

from app.schemas.common import MoneyOut


class SuspenseBalanceResponse(BaseModel):
    business_id: str
    suspense_balance: MoneyOut


class SuspenseEntryResponse(BaseModel):
    receipt_id: str
    receipt_date: date
    receipt_reference: str | None
    paid_by_other: str | None
    paid_by_contact_id: str | None
    paid_by_contact_type: str | None
    amount: MoneyOut
    line_index: int
