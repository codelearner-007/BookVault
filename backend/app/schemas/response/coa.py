"""COA response schemas."""

from pydantic import BaseModel, ConfigDict


class CoaGroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    name: str
    type: str
    parent_group_id: str | None
    is_system: bool
    sort_order: int
    version: int


class CoaAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    name: str
    code: str | None
    group_id: str | None
    parent_id: str | None
    cash_flow_category: str | None
    type: str
    description: str | None
    is_system: bool
    is_active: bool
    sort_order: int
    version: int
