"""Receipt response schemas (money as decimal strings)."""

import datetime as dt
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, computed_field

from app.core.money import round_money
from app.schemas.common import MoneyOut


class ReceiptLineItem(BaseModel):
    account_id: str
    account_name: str | None = None
    line_description: str | None = None
    qty: MoneyOut | None = None
    discount: MoneyOut | None = None
    amount: MoneyOut
    total: MoneyOut


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
    version: int
    created_at: dt.datetime
    updated_at: dt.datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total(self) -> MoneyOut:
        """Receipt total, computed by the server from the stored line totals."""
        return round_money(sum((line.total for line in self.lines), Decimal("0")))
