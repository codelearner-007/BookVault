"""Withholding tax responses (B7): receipts and settings; money as decimal strings."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import MoneyOut, PaginatedResponse


class WithholdingTaxReceiptResponse(BaseModel):
    id: str
    reference: str | None
    date: date
    status: str
    version: int
    is_locked: bool
    customer_id: str
    customer_name: str | None
    amount: MoneyOut
    description: str | None
    created_at: datetime
    updated_at: datetime


class WithholdingTaxReceiptListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    reference: str | None
    date: date
    customer_id: str
    customer_name: str | None
    amount: MoneyOut
    description: str | None
    status: str
    version: int


class WithholdingTaxReceiptListResponse(PaginatedResponse[WithholdingTaxReceiptListItem]):
    total_amount: MoneyOut


class WithholdingTaxSettingsResponse(BaseModel):
    wht_receivable_enabled: bool
    wht_payable_enabled: bool
    wht_base: str  # gross (incl. tax, the default, D-27) | net
    version: int
