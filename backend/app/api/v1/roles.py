"""Platform role catalog endpoints (read-only; global role editing removed, NA-01)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_live_super_admin
from app.core.pagination import PageParams, page_params
from app.schemas.common import PaginatedResponse
from app.schemas.response.permission import PermissionResponse
from app.schemas.response.role import RoleResponse, RoleWithPermissionsResponse
from app.services.role_service import RoleService

router = APIRouter(prefix="/roles", tags=["Roles"])


@router.get(
    "",
    response_model=PaginatedResponse[RoleResponse],
    dependencies=[Depends(require_live_super_admin)],
)
async def list_roles(
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[RoleResponse]:
    """Platform role catalog (live super admin)."""
    roles = [RoleResponse.model_validate(role) for role in await RoleService(db).list_roles()]
    return PaginatedResponse.build(params.slice(roles), len(roles), params.page, params.page_size)


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
    response_model=PaginatedResponse[PermissionResponse],
    dependencies=[Depends(require_live_super_admin)],
)
async def get_role_permissions(
    role_id: str,
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[PermissionResponse]:
    """Permissions of one role (live super admin)."""
    role = await RoleService(db).get_role_with_permissions(role_id)
    permissions = [PermissionResponse.model_validate(rp.permission) for rp in role.role_permissions]
    return PaginatedResponse.build(
        params.slice(permissions), len(permissions), params.page, params.page_size
    )
