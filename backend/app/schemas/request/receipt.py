"""Receipt request schemas for input validation."""

import datetime as dt
from typing import Optional

from pydantic import BaseModel, Field


class ReceiptLineItem(BaseModel):
    """A single line item within a receipt."""

    account_id: str
    line_description: Optional[str] = None
    qty: Optional[float] = None
    discount: Optional[float] = None
    amount: float
    total: float


class ReceiptCreate(BaseModel):
    """Request body for creating a new receipt."""

    date: dt.date
    reference: Optional[str] = None
    paid_by_type: str = Field(default="Contact", pattern="^(Contact|Other)$")
    paid_by_contact_id: Optional[str] = None
    paid_by_contact_type: Optional[str] = None
    paid_by_other: Optional[str] = None
    received_in_account_id: Optional[str] = None
    description: Optional[str] = None
    lines: list[ReceiptLineItem] = Field(default_factory=list)
    show_line_number: bool = False
    show_description: bool = False
    show_qty: bool = False
    show_discount: bool = False
    image_url: Optional[str] = None


class ReceiptUpdate(BaseModel):
    """Request body for partially updating a receipt's fields."""

    date: Optional[dt.date] = None
    reference: Optional[str] = None
    paid_by_type: Optional[str] = Field(None, pattern="^(Contact|Other)$")
    paid_by_contact_id: Optional[str] = None
    paid_by_contact_type: Optional[str] = None
    paid_by_other: Optional[str] = None
    received_in_account_id: Optional[str] = None
    description: Optional[str] = None
    lines: Optional[list[ReceiptLineItem]] = None
    show_line_number: Optional[bool] = None
    show_description: Optional[bool] = None
    show_qty: Optional[bool] = None
    show_discount: Optional[bool] = None
    image_url: Optional[str] = None
