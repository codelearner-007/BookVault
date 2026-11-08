"""Platform role catalog endpoints (read-only; global role editing removed, NA-01)."""

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_live_super_admin
from app.schemas.response.permission import PermissionResponse
from app.schemas.response.role import RoleResponse, RoleWithPermissionsResponse
from app.services.role_service import RoleService

router = APIRouter(prefix="/roles", tags=["Roles"])


@router.get(
    "",
    response_model=List[RoleResponse],
    dependencies=[Depends(require_live_super_admin)],
)
async def list_roles(
    db: AsyncSession = Depends(get_db),
) -> List[RoleResponse]:
    """List all roles. Requires: roles:read"""
    service = RoleService(db)
    roles = await service.list_roles()
    return [RoleResponse.model_validate(role) for role in roles]


@router.get(
    "/{role_id}",
    response_model=RoleWithPermissionsResponse,
    dependencies=[Depends(require_live_super_admin)],
)
async def get_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
) -> RoleWithPermissionsResponse:
    """Get role details with permissions. Requires: roles:read"""
    service = RoleService(db)
    role = await service.get_role_with_permissions(role_id)

    permissions = [
        PermissionResponse.model_validate(rp.permission) for rp in role.role_permissions
    ]

    response_data = RoleResponse.model_validate(role).model_dump()
    response_data["permissions"] = permissions

    return RoleWithPermissionsResponse(**response_data)


@router.get(
    "/{role_id}/permissions",
    response_model=List[PermissionResponse],
    dependencies=[Depends(require_live_super_admin)],
)
async def get_role_permissions(
    role_id: str,
    db: AsyncSession = Depends(get_db),
) -> List[PermissionResponse]:
    """Get permissions for a role. Requires: roles:read"""
    service = RoleService(db)
    role = await service.get_role_with_permissions(role_id)

    return [
        PermissionResponse.model_validate(rp.permission) for rp in role.role_permissions
    ]
