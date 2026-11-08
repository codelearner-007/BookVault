"""Permission catalog endpoint (read-only; global permission editing removed, NA-01)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_live_super_admin
from app.core.pagination import PageParams, page_params
from app.schemas.common import PaginatedResponse
from app.schemas.response.permission import (
    PermissionResponse,
    PermissionsGroupedByModuleResponse,
)
from app.services.permission_service import PermissionService

router = APIRouter(prefix="/permissions", tags=["Permissions"])


@router.get(
    "",
    response_model=PaginatedResponse[PermissionsGroupedByModuleResponse],
    dependencies=[Depends(require_live_super_admin)],
)
async def list_permissions_grouped(
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[PermissionsGroupedByModuleResponse]:
    """List all permissions grouped by module. Platform route: live super_admin only."""
    service = PermissionService(db)
    grouped = await service.list_grouped_by_module()

    modules = [
        PermissionsGroupedByModuleResponse(
            module=module,
            permissions=[PermissionResponse.model_validate(p) for p in permissions],
        )
        for module, permissions in grouped.items()
    ]
    return PaginatedResponse.build(params.slice(modules), len(modules), params.page, params.page_size)
