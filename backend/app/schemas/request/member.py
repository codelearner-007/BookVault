"""Request schemas for business members, per-area access (D-39) and business user management (D-30)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints
from typing_extensions import Annotated

from app.core.access_rights import AccessMode, AreaRight

AREA_KEY_MAX_LENGTH = 64
MAX_GRID_ITEMS = 200
UserId = Annotated[str, StringConstraints(pattern=r"^[0-9a-fA-F-]{36}$")]


class AreaAccessIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    area_key: Annotated[str, StringConstraints(max_length=AREA_KEY_MAX_LENGTH)]
    rights: list[AreaRight] = Field(max_length=len(AreaRight))


class MemberAccessRequest(BaseModel):
    """PUT .../members/{member_id}/access: replaces the whole grid (version-checked)."""

    model_config = ConfigDict(extra="forbid")

    access_mode: AccessMode
    version: int
    areas: list[AreaAccessIn] = Field(default_factory=list, max_length=MAX_GRID_ITEMS)


class AddMemberRequest(BaseModel):
    """POST /businesses/{id}/members: add a user the owner created (never by email)."""

    model_config = ConfigDict(extra="forbid")

    user_id: UserId
    access_mode: AccessMode = AccessMode.CUSTOM
    areas: list[AreaAccessIn] = Field(default_factory=list, max_length=MAX_GRID_ITEMS)


class UpdateMemberRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["active", "disabled"]
    version: int


class EmailCheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr


ManagedUserAction = Literal["create", "edit", "reset_password", "disable", "enable", "delete"]


class ManagedUserActionRequest(BaseModel):
    """Authorize (and audit) one account action of the Next.js user-management routes."""

    model_config = ConfigDict(extra="forbid")

    action: ManagedUserAction
    email: EmailStr | None = None
    full_name: Annotated[str, StringConstraints(min_length=1, max_length=120)] | None = None
