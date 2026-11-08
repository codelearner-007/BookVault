"""Countries reference endpoint (replaces the hardcoded frontend list, CS-22)."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.core.pagination import SEARCH_MAX, PageParams, page_params
from app.schemas.common import PaginatedResponse
from app.schemas.response.country import CountryResponse
from app.services.country_service import CountryService

router = APIRouter(prefix="/countries", tags=["Countries"])


@router.get(
    "",
    response_model=PaginatedResponse[CountryResponse],
    dependencies=[Depends(get_current_user)],
)
async def list_countries(
    params: PageParams = Depends(page_params),
    search: Optional[str] = Query(None, max_length=SEARCH_MAX),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[CountryResponse]:
    return await CountryService(db).list_page(search, params)
