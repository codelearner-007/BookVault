"""Permission catalog endpoint (read-only; global permission editing removed, NA-01)."""

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_live_super_admin
from app.schemas.response.permission import (
    PermissionResponse,
    PermissionsGroupedByModuleResponse,
)
from app.services.permission_service import PermissionService

router = APIRouter(prefix="/permissions", tags=["Permissions"])


@router.get(
    "",
    response_model=List[PermissionsGroupedByModuleResponse],
    dependencies=[Depends(require_live_super_admin)],
)
async def list_permissions_grouped(
    db: AsyncSession = Depends(get_db),
) -> List[PermissionsGroupedByModuleResponse]:
    """List all permissions grouped by module. Platform route: live super_admin only."""
    service = PermissionService(db)
    grouped = await service.list_grouped_by_module()

    return [
        PermissionsGroupedByModuleResponse(
            module=module,
            permissions=[PermissionResponse.model_validate(p) for p in permissions],
        )
        for module, permissions in grouped.items()
    ]
