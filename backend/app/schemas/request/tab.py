"""Tab request schemas."""

from pydantic import BaseModel, Field


class AdminTabUpsertItem(BaseModel):
    key: str = Field(min_length=1)
    label: str = Field(min_length=1)
    enabled: bool = True


class UpsertAdminTabsRequest(BaseModel):
    items: list[AdminTabUpsertItem]


class BusinessTabUpdateItem(BaseModel):
    key: str
    enabled: bool


class UpsertBusinessTabsRequest(BaseModel):
    items: list[BusinessTabUpdateItem]
