"""Business response schemas."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class BusinessFormatResponse(BaseModel):
    """How the business writes dates and amounts; null fields fall back to the client defaults."""

    date_format: str | None = None
    number_format: str | None = None
    currency_code: str | None = None
    decimal_places: int | None = None


class BusinessResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    country_id: str | None
    country: str | None = None
    address: str | None = None
    owner_id: str
    version: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    format: BusinessFormatResponse | None = None


class BusinessExportResponse(BaseModel):
    """Every business-scoped row, by table (the backup offered before a purge)."""

    business_id: str
    exported_at: datetime
    tables: dict[str, list[dict[str, Any]]]
