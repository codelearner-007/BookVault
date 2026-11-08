"""Response schemas for business members, access grids, presets and managed users."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.response.business import BusinessResponse


class AreaAccessOut(BaseModel):
    area_key: str
    rights: list[str]


class MemberAccessResponse(BaseModel):
    access_mode: str
    version: int
    areas: list[AreaAccessOut]


class MemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    email: str | None = None
    full_name: str | None = None
    access_mode: str
    status: str
    version: int
    is_owner: bool
    created_at: datetime


class MemberListResponse(BaseModel):
    items: list[MemberResponse]
    total: int
    page: int
    page_size: int


class MyBusinessAccessResponse(BaseModel):
    """GET /businesses/{id}/me: my rights per area, for UI hiding only."""

    business_id: str
    is_owner: bool
    access_mode: str
    areas: list[AreaAccessOut]


class AccessPresetResponse(BaseModel):
    key: str
    label: str
    areas: list[AreaAccessOut]


class AccessPresetListResponse(BaseModel):
    items: list[AccessPresetResponse]


class MyBusinessResponse(BusinessResponse):
    is_owner: bool


class MyBusinessListResponse(BaseModel):
    items: list[MyBusinessResponse]
    total: int
    page: int
    page_size: int


class ManagedUserResponse(BaseModel):
    user_id: str
    email: str | None
    full_name: str | None
    role: str | None
    banned: bool


class ManagedUserListResponse(BaseModel):
    items: list[ManagedUserResponse]
    total: int
    page: int
    page_size: int
