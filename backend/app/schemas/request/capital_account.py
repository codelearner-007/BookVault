"""Capital account request schemas (minimal, B3; sub-accounts in B11)."""

from typing import Optional

from pydantic import Field

from app.schemas.common import NAME_MAX, OptionalCode, RequestModel, ShortText, VersionedRequest


class CapitalAccountCreate(RequestModel):
    name: ShortText
    code: OptionalCode = None
    is_inactive: bool = False


class CapitalAccountUpdate(VersionedRequest):
    name: Optional[str] = Field(None, min_length=1, max_length=NAME_MAX)
    code: OptionalCode = None
    is_inactive: Optional[bool] = None
