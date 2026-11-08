"""Suspense responses (credit balance positive; money as decimal strings)."""

from datetime import date

from pydantic import BaseModel

from app.schemas.common import MoneyOut


class SuspenseBalanceResponse(BaseModel):
    business_id: str
    suspense_balance: MoneyOut


class SuspenseEntryResponse(BaseModel):
    document_id: str
    document_type: str
    date: date
    reference: str | None
    description: str | None
    amount: MoneyOut
