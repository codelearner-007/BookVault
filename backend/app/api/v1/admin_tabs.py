"""Admin tabs endpoints — super_admin only."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_role
from app.schemas.request.tab import UpsertAdminTabsRequest
from app.schemas.response.tab import AdminTabListResponse
from app.services.business_service import BusinessService

router = APIRouter(prefix="/admin-tabs", tags=["Admin Tabs"])


@router.get(
    "",
    response_model=AdminTabListResponse,
    dependencies=[Depends(require_role("super_admin"))],
)
async def list_admin_tabs(db: AsyncSession = Depends(get_db)) -> AdminTabListResponse:
    """List all global admin tabs. Super admin only."""
    service = BusinessService(db)
    return await service.list_admin_tabs()


@router.put(
    "",
    response_model=AdminTabListResponse,
    dependencies=[Depends(require_role("super_admin"))],
)
async def upsert_admin_tabs(
    body: UpsertAdminTabsRequest,
    db: AsyncSession = Depends(get_db),
) -> AdminTabListResponse:
    """Create or update global admin tabs. Super admin only."""
    service = BusinessService(db)
    return await service.upsert_admin_tabs(body.items)
