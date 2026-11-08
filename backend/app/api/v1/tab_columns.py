"""Tab columns endpoints: per-business column visibility and ordering."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_tab_area_access
from app.schemas.request.tab_columns import TabColumnsUpdate
from app.schemas.response.tab_columns import TabColumnsResponse
from app.services.access_service import BusinessContext
from app.services.tab_columns_service import TabColumnsService

router = APIRouter(prefix="/businesses/{business_id}/tab-columns", tags=["Tab Columns"])


@router.get("/{tab_key}", response_model=TabColumnsResponse)
async def get_tab_columns(
    tab_key: str,
    ctx: BusinessContext = Depends(require_tab_area_access(AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TabColumnsResponse:
    return await TabColumnsService(db).get(ctx.business_id, tab_key)


@router.put("/{tab_key}", response_model=TabColumnsResponse)
async def update_tab_columns(
    tab_key: str,
    body: TabColumnsUpdate,
    ctx: BusinessContext = Depends(require_business_access("settings.customize_tabs", AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TabColumnsResponse:
    return await TabColumnsService(db).replace(ctx, tab_key, body)
