"""Tab response schemas."""

from pydantic import BaseModel, ConfigDict


class AdminTabResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str
    label: str
    enabled: bool
    default_enabled: bool
    parent_key: str | None = None
    order_index: int


class BusinessTabResponse(BaseModel):
    """A tab of one business; the label always comes from the admin_tabs catalog."""

    id: str
    business_id: str
    key: str
    label: str
    enabled: bool
    order_index: int
    parent_key: str | None = None
