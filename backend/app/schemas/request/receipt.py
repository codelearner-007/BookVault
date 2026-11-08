"""Receipt request schemas (strict; money as bounded Decimal)."""

import datetime as dt
from decimal import Decimal
from typing import Annotated, Literal, Optional

from pydantic import Field

from app.schemas.common import (
    KEY_MAX,
    LIST_MAX,
    MONEY_DECIMAL_PLACES,
    MONEY_LIMIT,
    MONEY_MAX_DIGITS,
    IdStr,
    Money,
    NonNegativeMoney,
    OptionalName,
    OptionalText,
    OptionalUrl,
    RequestModel,
    VersionedRequest,
)

Quantity = Annotated[
    Decimal,
    Field(gt=0, max_digits=MONEY_MAX_DIGITS, decimal_places=MONEY_DECIMAL_PLACES, le=MONEY_LIMIT),
]
PaidByType = Literal["Contact", "Other"]
ContactType = Literal["customer", "supplier"]


class ReceiptLineItem(RequestModel):
    """One receipt line. `total` is accepted for compatibility but always recomputed (AC-22)."""

    account_id: str = Field(min_length=1, max_length=KEY_MAX)  # COA account id or "suspense"
    line_description: OptionalText = None
    qty: Optional[Quantity] = None
    discount: Optional[NonNegativeMoney] = None
    amount: Money
    total: Optional[Money] = None


class ReceiptCreate(RequestModel):
    date: dt.date
    reference: OptionalName = None
    paid_by_type: PaidByType = "Contact"
    paid_by_contact_id: Optional[IdStr] = None
    paid_by_contact_type: Optional[ContactType] = None
    paid_by_other: OptionalName = None
    received_in_account_id: Optional[IdStr] = None
    description: OptionalText = None
    lines: list[ReceiptLineItem] = Field(default_factory=list, max_length=LIST_MAX)
    show_line_number: bool = False
    show_description: bool = False
    show_qty: bool = False
    show_discount: bool = False
    image_url: OptionalUrl = None


class ReceiptUpdate(VersionedRequest):
    """Partial update; only the fields sent are changed."""

    date: Optional[dt.date] = None
    reference: OptionalName = None
    paid_by_type: Optional[PaidByType] = None
    paid_by_contact_id: Optional[IdStr] = None
    paid_by_contact_type: Optional[ContactType] = None
    paid_by_other: OptionalName = None
    received_in_account_id: Optional[IdStr] = None
    description: OptionalText = None
    lines: Optional[list[ReceiptLineItem]] = Field(None, max_length=LIST_MAX)
    show_line_number: Optional[bool] = None
    show_description: Optional[bool] = None
    show_qty: Optional[bool] = None
    show_discount: Optional[bool] = None
    image_url: OptionalUrl = None
