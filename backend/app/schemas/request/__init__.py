"""Request schemas for API input validation."""

from app.schemas.request.business import CreateBusinessRequest
from app.schemas.request.permission import CreatePermissionRequest
from app.schemas.request.profile import UpdateProfileRequest
from app.schemas.request.role import (
    CreateRoleRequest,
    UpdateRolePermissionsRequest,
    UpdateRoleRequest,
)
from app.schemas.request.tab import (
    AdminTabUpsertItem,
    BusinessTabUpdateItem,
    UpsertAdminTabsRequest,
    UpsertBusinessTabsRequest,
)
from app.schemas.request.user_role import AssignUserRoleRequest

__all__ = [
    "AdminTabUpsertItem",
    "AssignUserRoleRequest",
    "BusinessTabUpdateItem",
    "CreateBusinessRequest",
    "CreatePermissionRequest",
    "CreateRoleRequest",
    "UpdateProfileRequest",
    "UpdateRolePermissionsRequest",
    "UpdateRoleRequest",
    "UpsertAdminTabsRequest",
    "UpsertBusinessTabsRequest",
]
