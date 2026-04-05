"""Business response schemas for API output serialization."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BusinessResponse(BaseModel):
    """Single business resource."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    country: str | None
    owner_id: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class BusinessListResponse(BaseModel):
    """Paginated list of businesses."""

    items: list[BusinessResponse]
    total: int
