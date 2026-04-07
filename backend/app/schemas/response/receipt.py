"""Receipt response schemas for API output serialization."""

import datetime as dt

from pydantic import BaseModel, ConfigDict


class ReceiptLineItem(BaseModel):
    """A single line item within a receipt response."""

    account_id: str
    account_name: str | None = None
    line_description: str | None = None
    qty: float | None = None
    discount: float | None = None
    amount: float
    total: float


class ReceiptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    date: dt.date
    reference: str | None
    paid_by_type: str
    paid_by_contact_id: str | None
    paid_by_contact_type: str | None
    paid_by_other: str | None
    received_in_account_id: str | None
    received_in_account_name: str | None = None
    paid_by_name: str | None = None
    description: str | None
    lines: list[ReceiptLineItem]
    show_line_number: bool
    show_description: bool
    show_qty: bool
    show_discount: bool
    image_url: str | None
    created_at: dt.datetime
    updated_at: dt.datetime


class ReceiptListResponse(BaseModel):
    items: list[ReceiptResponse]
    total: int
