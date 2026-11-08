"""Bank and cash accounts endpoints."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_idempotency_key
from app.core.pagination import PageParams, page_params
from app.schemas.request.bank_account import BankAccountCreate, BankAccountUpdate
from app.schemas.response.bank_account import BankAccountListResponse, BankAccountResponse
from app.services.access_service import BusinessContext
from app.services.bank_account_service import BankAccountService
from app.services.idempotency_service import IdempotencyService, business_scope

AREA = "bank_cash_accounts"

router = APIRouter(prefix="/businesses/{business_id}/bank-accounts", tags=["Bank Accounts"])


@router.get("", response_model=BankAccountListResponse)
async def list_bank_accounts(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> BankAccountListResponse:
    return await BankAccountService(db).list_page(ctx.business_id, params)


@router.post("", response_model=BankAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_bank_account(
    body: BankAccountCreate,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> BankAccountResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, "POST bank-accounts"),
        body,
        lambda: BankAccountService(db).create(ctx, body),
    )


@router.get("/{bank_account_id}", response_model=BankAccountResponse)
async def get_bank_account(
    bank_account_id: str,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> BankAccountResponse:
    return await BankAccountService(db).get(ctx.business_id, bank_account_id)


@router.put("/{bank_account_id}", response_model=BankAccountResponse)
async def update_bank_account(
    bank_account_id: str,
    body: BankAccountUpdate,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> BankAccountResponse:
    return await BankAccountService(db).update(ctx, bank_account_id, body)


@router.delete("/{bank_account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bank_account(
    bank_account_id: str,
    version: int = Query(..., ge=1),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> None:
    await BankAccountService(db).delete(ctx, bank_account_id, version)
