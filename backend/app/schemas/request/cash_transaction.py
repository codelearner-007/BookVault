"""Receipt and payment request schemas (B3; one shape for both directions, PR-01, PR-07)."""

import datetime as dt
from decimal import Decimal
from typing import Annotated, Optional

from pydantic import Field, model_validator

from app.schemas.common import (
    LIST_MAX,
    MONEY_DECIMAL_PLACES,
    MONEY_LIMIT,
    MONEY_MAX_DIGITS,
    IdStr,
    Money,
    NonNegativeMoney,
    OptionalCode,
    OptionalName,
    OptionalText,
    RequestModel,
    VersionedRequest,
)

Quantity = Annotated[
    Decimal,
    Field(gt=0, max_digits=MONEY_MAX_DIGITS, decimal_places=MONEY_DECIMAL_PLACES, le=MONEY_LIMIT),
]


class LineAmountsIn(RequestModel):
    """Line amount = round(qty x unit_price) - discount (qty defaults to 1); computed by the server."""

    qty: Optional[Quantity] = None
    unit_price: Money
    discount: Optional[NonNegativeMoney] = None


class CashLineIn(LineAmountsIn):
    # Optional in the schema so a missing account is answered with code account_required (T31).
    account_id: Optional[IdStr] = None
    party_id: Optional[IdStr] = None
    invoice_id: Optional[IdStr] = None  # receipts, Accounts receivable lines only; null = Automatic (B4)
    description: OptionalText = None


class CashTransactionFields(RequestModel):
    date: dt.date
    reference: OptionalCode = None
    bank_account_id: Optional[IdStr] = None  # None = the bank side goes to Suspense (PR-78)
    counterparty_party_id: Optional[IdStr] = None
    counterparty_name: OptionalName = None
    description: OptionalText = None
    clears_later: bool = False
    cleared_on: Optional[dt.date] = None
    lines: list[CashLineIn] = Field(min_length=1, max_length=LIST_MAX)

    @model_validator(mode="after")
    def _consistent(self) -> "CashTransactionFields":
        if self.counterparty_party_id and self.counterparty_name:
            raise ValueError("Give a contact or a name, not both")
        if self.cleared_on and not self.clears_later:
            raise ValueError("A clear date needs 'cleared on a later date'")
        return self


class CreateCashTransactionRequest(CashTransactionFields):
    """post=false saves a draft; post=true posts at once."""

    post: bool = False


class UpdateCashTransactionRequest(VersionedRequest, CashTransactionFields):
    pass


class CashTotalsRequest(RequestModel):
    lines: list[LineAmountsIn] = Field(max_length=LIST_MAX)
