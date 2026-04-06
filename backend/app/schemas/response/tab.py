"""Tab response schemas."""

from pydantic import BaseModel, ConfigDict


class AdminTabResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str
    label: str
    enabled: bool
    order_index: int


class BusinessTabResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    key: str
    label: str
    enabled: bool
    order_index: int


class AdminTabListResponse(BaseModel):
    items: list[AdminTabResponse]


class BusinessTabListResponse(BaseModel):
    items: list[BusinessTabResponse]
