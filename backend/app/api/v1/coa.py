"""Chart of Accounts endpoints."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_idempotency_key
from app.core.pagination import PageParams, page_params
from app.schemas.common import PaginatedResponse
from app.schemas.request.coa import (
    CoaAccountCreate,
    CoaAccountsOrderUpdate,
    CoaAccountUpdate,
    CoaGroupCreate,
    CoaGroupsOrderUpdate,
    CoaGroupUpdate,
)
from app.schemas.response.coa import CoaAccountResponse, CoaGroupResponse
from app.services.access_service import BusinessContext
from app.services.coa_service import CoaService
from app.services.idempotency_service import IdempotencyService, business_scope

AREA = "settings.chart_of_accounts"
_VIEW = require_business_access(AREA, AreaRight.VIEW)
_CREATE = require_business_access(AREA, AreaRight.CREATE)
_EDIT = require_business_access(AREA, AreaRight.EDIT)
_DELETE = require_business_access(AREA, AreaRight.DELETE)

router = APIRouter(prefix="/businesses/{business_id}/chart-of-accounts", tags=["Chart of Accounts"])


# -------------------------------------------------------------------- Groups


@router.get("/groups", response_model=PaginatedResponse[CoaGroupResponse])
async def list_groups(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(_VIEW),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> PaginatedResponse[CoaGroupResponse]:
    return await CoaService(db).list_groups(ctx.business_id, params)


@router.post("/groups", response_model=CoaGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    body: CoaGroupCreate,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(_CREATE),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CoaGroupResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, "POST coa groups"),
        body,
        lambda: CoaService(db).create_group(ctx, body),
    )


@router.put("/groups/order", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_groups(
    body: CoaGroupsOrderUpdate,
    ctx: BusinessContext = Depends(_EDIT),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> None:
    await CoaService(db).reorder_groups(ctx, body)


@router.get("/groups/{group_id}", response_model=CoaGroupResponse)
async def get_group(
    group_id: str,
    ctx: BusinessContext = Depends(_VIEW),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CoaGroupResponse:
    return await CoaService(db).get_group(ctx.business_id, group_id)


@router.put("/groups/{group_id}", response_model=CoaGroupResponse)
async def update_group(
    group_id: str,
    body: CoaGroupUpdate,
    ctx: BusinessContext = Depends(_EDIT),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CoaGroupResponse:
    return await CoaService(db).update_group(ctx, group_id, body)


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: str,
    version: int = Query(..., ge=1),
    ctx: BusinessContext = Depends(_DELETE),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> None:
    await CoaService(db).delete_group(ctx, group_id, version)


# ------------------------------------------------------------------ Accounts


@router.get("/accounts", response_model=PaginatedResponse[CoaAccountResponse])
async def list_accounts(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(_VIEW),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> PaginatedResponse[CoaAccountResponse]:
    return await CoaService(db).list_accounts(ctx.business_id, params)


@router.post("/accounts", response_model=CoaAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(
    body: CoaAccountCreate,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(_CREATE),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CoaAccountResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, "POST coa accounts"),
        body,
        lambda: CoaService(db).create_account(ctx, body),
    )


@router.put("/accounts/order", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_accounts(
    body: CoaAccountsOrderUpdate,
    ctx: BusinessContext = Depends(_EDIT),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> None:
    await CoaService(db).reorder_accounts(ctx, body)


@router.get("/accounts/{account_id}", response_model=CoaAccountResponse)
async def get_account(
    account_id: str,
    ctx: BusinessContext = Depends(_VIEW),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CoaAccountResponse:
    return await CoaService(db).get_account(ctx.business_id, account_id)


@router.put("/accounts/{account_id}", response_model=CoaAccountResponse)
async def update_account(
    account_id: str,
    body: CoaAccountUpdate,
    ctx: BusinessContext = Depends(_EDIT),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CoaAccountResponse:
    return await CoaService(db).update_account(ctx, account_id, body)


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: str,
    version: int = Query(..., ge=1),
    ctx: BusinessContext = Depends(_DELETE),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> None:
    await CoaService(db).delete_account(ctx, account_id, version)
