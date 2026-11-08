"""Customer and supplier request schemas (both are contacts with the same fields)."""

from typing import Optional

from pydantic import Field

from app.schemas.common import (
    NAME_MAX,
    OptionalCode,
    OptionalEmail,
    OptionalText,
    RequestModel,
    ShortText,
    VersionedRequest,
)


class ContactCreate(RequestModel):
    name: ShortText
    code: OptionalCode = None
    billing_address: OptionalText = None
    delivery_address: OptionalText = None
    email: OptionalEmail = None


class ContactUpdate(VersionedRequest):
    """Partial update; only the fields sent are changed (an explicit null clears)."""

    name: Optional[str] = Field(None, min_length=1, max_length=NAME_MAX)
    code: OptionalCode = None
    billing_address: OptionalText = None
    delivery_address: OptionalText = None
    email: OptionalEmail = None


CustomerCreate = ContactCreate
CustomerUpdate = ContactUpdate
SupplierCreate = ContactCreate
SupplierUpdate = ContactUpdate
