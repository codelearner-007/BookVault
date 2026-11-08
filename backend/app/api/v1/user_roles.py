"""User role assignment endpoints."""



from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    SUPER_ADMIN_ROLE,
    get_current_user,
    get_db,
    require_live_super_admin,
)
from app.core.exceptions import RoleDeniedError
from app.core.pagination import PageParams, page_params
from app.core.rate_limit import limiter
from app.schemas.auth import CurrentUser
from app.schemas.common import PaginatedResponse
from app.schemas.request.user_role import AssignUserRoleRequest
from app.schemas.response.user_role import UserRoleResponse
from app.services.audit_service import AuditService
from app.services.user_role_service import UserRoleService

router = APIRouter(prefix="/users", tags=["User Roles"])


@router.get(
    "/{user_id}/roles",
    response_model=PaginatedResponse[UserRoleResponse],
)
async def list_user_roles(
    user_id: str,
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_db, scope="function"),
    current_user: CurrentUser = Depends(get_current_user),
) -> PaginatedResponse[UserRoleResponse]:
    """
    List all roles assigned to a user.

    Users can view their own roles. Viewing other users' roles requires a live super_admin.
    """
    service = UserRoleService(db)
    if user_id != current_user.user_id and not await service.is_super_admin(current_user.user_id):
        raise RoleDeniedError(SUPER_ADMIN_ROLE)

    roles = [UserRoleResponse.model_validate(ur) for ur in await service.list_user_roles(user_id)]
    return PaginatedResponse.build(params.slice(roles), len(roles), params.page, params.page_size)


@router.post(
    "/{user_id}/roles",
    response_model=UserRoleResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_live_super_admin)],
)
@limiter.limit("30/minute")
async def assign_role_to_user(
    request: Request,
    user_id: str,
    role_data: AssignUserRoleRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
    current_user: CurrentUser = Depends(get_current_user),
) -> UserRoleResponse:
    """Assign a role to a user. Requires: users:assign_roles"""
    service = UserRoleService(db)
    old_role = await service.get_live_role_name(user_id)
    user_role = await service.assign_role(user_id, role_data.role_id, current_user)

    await AuditService(db).record(
        current_user.user_id, "user_role_assigned", "UserRole", user_role.id,
        details={"target_user_id": user_id, "role_id": role_data.role_id, "old_role": old_role,
                 "new_role": await service.get_live_role_name(user_id)},
    )

    # Refresh to load role relationship
    await db.refresh(user_role, ["role"])

    return UserRoleResponse.model_validate(user_role)


@router.delete(
    "/{user_id}/roles/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_live_super_admin)],
)
@limiter.limit("30/minute")
async def remove_role_from_user(
    request: Request,
    user_id: str,
    role_id: str,
    db: AsyncSession = Depends(get_db, scope="function"),
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    """Remove a role from a user. Requires: users:assign_roles"""
    service = UserRoleService(db)
    old_role = await service.get_live_role_name(user_id)
    deleted = await service.remove_role(user_id, role_id, current_user)

    if deleted:
        await AuditService(db).record(
            current_user.user_id, "user_role_removed", "UserRole", role_id,
            details={"target_user_id": user_id, "role_id": role_id, "old_role": old_role,
                     "new_role": await service.get_live_role_name(user_id)},
        )
