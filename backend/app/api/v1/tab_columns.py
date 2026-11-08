"""Tab columns endpoints — per-business column visibility and ordering."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_tab_area_access
from app.schemas.request.tab_columns import TabColumnsUpdate
from app.schemas.response.tab_columns import TabColumnsResponse
from app.services.tab_columns_service import TabColumnsService

router = APIRouter(
    prefix="/businesses/{business_id}/tab-columns",
    tags=["Tab Columns"],
)


@router.get(
    "/{tab_key}",
    response_model=TabColumnsResponse,
    dependencies=[Depends(require_tab_area_access(AreaRight.VIEW))],
)
async def get_tab_columns(
    business_id: str,
    tab_key: str,
    db: AsyncSession = Depends(get_db),
) -> TabColumnsResponse:
    return await TabColumnsService(db).get_tab_columns(business_id, tab_key)


@router.put(
    "/{tab_key}",
    response_model=TabColumnsResponse,
    dependencies=[Depends(require_business_access("settings.customize_tabs", AreaRight.EDIT))],
)
async def update_tab_columns(
    business_id: str,
    tab_key: str,
    body: TabColumnsUpdate,
    db: AsyncSession = Depends(get_db),
) -> TabColumnsResponse:
    return await TabColumnsService(db).update_tab_columns(business_id, tab_key, body)
