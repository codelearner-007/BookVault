"""Admin tabs catalog endpoints (live super admin only)."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_live_super_admin
from app.core.pagination import PageParams, page_params
from app.schemas.auth import CurrentUser
from app.schemas.common import PaginatedResponse
from app.schemas.request.tab import UpsertAdminTabsRequest
from app.schemas.response.tab import AdminTabResponse
from app.services.tab_service import TabService

router = APIRouter(prefix="/admin-tabs", tags=["Admin Tabs"])


@router.get(
    "",
    response_model=PaginatedResponse[AdminTabResponse],
    dependencies=[Depends(require_live_super_admin)],
)
async def list_admin_tabs(
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[AdminTabResponse]:
    tabs = await TabService(db).list_admin_tabs()
    return PaginatedResponse.build(params.slice(tabs), len(tabs), params.page, params.page_size)


@router.put("", response_model=PaginatedResponse[AdminTabResponse])
async def upsert_admin_tabs(
    body: UpsertAdminTabsRequest,
    params: PageParams = Depends(page_params),
    current_user: CurrentUser = Depends(require_live_super_admin),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[AdminTabResponse]:
    tabs = await TabService(db).upsert_admin_tabs(current_user.user_id, body.items)
    return PaginatedResponse.build(params.slice(tabs), len(tabs), params.page, params.page_size)


@router.delete("/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_tab(
    key: str,
    current_user: CurrentUser = Depends(require_live_super_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    await TabService(db).delete_admin_tab(current_user.user_id, key)
