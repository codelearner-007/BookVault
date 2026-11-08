"""Business response schemas."""

from datetime import datetime
from typing import Any

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


class BusinessExportResponse(BaseModel):
    """Every business-scoped row, by table (the backup offered before a purge)."""

    business_id: str
    exported_at: datetime
    tables: dict[str, list[dict[str, Any]]]
