"""Capital accounts endpoints (minimal, B3, D-04)."""

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_idempotency_key
from app.core.pagination import SEARCH_MAX, PageParams, page_params
from app.schemas.request.capital_account import CapitalAccountCreate, CapitalAccountUpdate
from app.schemas.response.party import CapitalAccountListResponse, CapitalAccountResponse
from app.services.access_service import BusinessContext
from app.services.idempotency_service import IdempotencyService, business_scope
from app.services.party_service import PartyService

AREA = "capital_accounts"
router = APIRouter(prefix="/businesses/{business_id}/capital-accounts", tags=["Capital Accounts"])


@router.get("", response_model=CapitalAccountListResponse)
async def list_capital_accounts(
    search: Optional[str] = Query(None, max_length=SEARCH_MAX),
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CapitalAccountListResponse:
    return await PartyService(db).list_capital(ctx.business_id, search, params)


@router.post("", response_model=CapitalAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_capital_account(
    body: CapitalAccountCreate,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CapitalAccountResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, "POST capital-accounts"), body,
        lambda: PartyService(db).create_capital(ctx, body),
    )


@router.get("/{party_id}", response_model=CapitalAccountResponse)
async def get_capital_account(
    party_id: str,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CapitalAccountResponse:
    return await PartyService(db).get_capital(ctx.business_id, party_id)


@router.put("/{party_id}", response_model=CapitalAccountResponse)
async def update_capital_account(
    party_id: str,
    body: CapitalAccountUpdate,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CapitalAccountResponse:
    return await PartyService(db).update_capital(ctx, party_id, body)


@router.delete("/{party_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_capital_account(
    party_id: str,
    version: int = Query(..., ge=1),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> None:
    await PartyService(db).delete_capital(ctx, party_id, version)
