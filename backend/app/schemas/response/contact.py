"""Customer and supplier response schema."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    name: str
    code: str | None
    billing_address: str | None
    delivery_address: str | None
    email: str | None
    version: int
    created_at: datetime
    updated_at: datetime
