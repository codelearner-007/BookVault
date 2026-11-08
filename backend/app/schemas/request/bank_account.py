"""Bank and cash account request schemas (B3: no balances; starting balances are separate)."""

from typing import Optional

from pydantic import Field

from app.schemas.common import NAME_MAX, OptionalCode, OptionalText, RequestModel, ShortText, VersionedRequest


class BankAccountCreate(RequestModel):
    name: ShortText
    code: OptionalCode = None
    description: OptionalText = None
    can_have_pending: bool = False
    is_inactive: bool = False


class BankAccountUpdate(VersionedRequest):
    """Partial update; only the fields sent are changed."""

    name: Optional[str] = Field(None, min_length=1, max_length=NAME_MAX)
    code: OptionalCode = None
    description: OptionalText = None
    can_have_pending: Optional[bool] = None
    is_inactive: Optional[bool] = None
