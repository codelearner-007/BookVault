"""Suspense balance endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access
from app.core.pagination import PageParams, page_params
from app.schemas.common import PaginatedResponse
from app.schemas.response.suspense import SuspenseBalanceResponse, SuspenseEntryResponse
from app.services.access_service import BusinessContext
from app.services.suspense_service import SuspenseService

router = APIRouter(prefix="/businesses/{business_id}/suspense", tags=["Suspense"])
_VIEW = require_business_access("suspense", AreaRight.VIEW)


@router.get("/balance", response_model=SuspenseBalanceResponse)
async def get_suspense_balance(
    ctx: BusinessContext = Depends(_VIEW),
    db: AsyncSession = Depends(get_db),
) -> SuspenseBalanceResponse:
    return await SuspenseService(db).balance(ctx.business_id)


@router.get("/entries", response_model=PaginatedResponse[SuspenseEntryResponse])
async def get_suspense_entries(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(_VIEW),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[SuspenseEntryResponse]:
    return await SuspenseService(db).entries(ctx.business_id, params)
