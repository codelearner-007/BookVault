"""Business response schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BusinessResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    country: str | None
    address: str | None = None
    owner_id: str
    version: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
