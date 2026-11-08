"""Bank account request schemas."""

from typing import Optional

from pydantic import Field

from app.schemas.common import (
    NAME_MAX,
    NonNegativeMoney,
    OptionalText,
    RequestModel,
    ShortText,
    VersionedRequest,
)


class BankAccountCreate(RequestModel):
    name: ShortText
    opening_balance: NonNegativeMoney = 0
    description: OptionalText = None


class BankAccountUpdate(VersionedRequest):
    """Name and description only; balances are derived (receipts) and never sent."""

    name: Optional[str] = Field(None, min_length=1, max_length=NAME_MAX)
    description: OptionalText = None
