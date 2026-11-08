"""Party picker for document forms (customers, suppliers, capital accounts; B3)."""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_business_member
from app.core.pagination import SEARCH_MAX, PageParams, page_params
from app.schemas.response.party import PartyListResponse
from app.services.access_service import BusinessContext
from app.services.party_service import PartyService

router = APIRouter(prefix="/businesses/{business_id}/parties", tags=["Parties"])


@router.get("", response_model=PartyListResponse)
async def list_parties(
    kind: Optional[Literal["customer", "supplier", "capital_account"]] = Query(None),
    q: Optional[str] = Query(None, max_length=SEARCH_MAX),
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_member()),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> PartyListResponse:
    """Names come from each kind's own table: RLS lists only what the caller may see."""
    return await PartyService(db).parties(ctx.business_id, kind, q, params)
