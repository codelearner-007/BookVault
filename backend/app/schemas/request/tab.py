"""Tab request schemas (catalog keys are validated against admin_tabs, CS-23)."""

from typing import Optional

from pydantic import Field

from app.schemas.common import KEY_MAX, LIST_MAX, RequestModel, ShortText

TabKey = Field(min_length=1, max_length=KEY_MAX, pattern=r"^[a-z0-9][a-z0-9._-]*$")


class AdminTabUpsertItem(RequestModel):
    key: str = TabKey
    label: ShortText
    enabled: bool = True
    default_enabled: bool = False
    parent_key: Optional[str] = Field(None, min_length=1, max_length=KEY_MAX)


class UpsertAdminTabsRequest(RequestModel):
    items: list[AdminTabUpsertItem] = Field(max_length=LIST_MAX)


class BusinessTabUpdateItem(RequestModel):
    key: str = TabKey
    enabled: bool


class UpsertBusinessTabsRequest(RequestModel):
    items: list[BusinessTabUpdateItem] = Field(max_length=LIST_MAX)
