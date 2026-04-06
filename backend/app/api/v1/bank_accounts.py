"""Bank accounts endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_role
from app.schemas.request.bank_account import BankAccountCreate, BankAccountUpdate
from app.schemas.response.bank_account import BankAccountListResponse, BankAccountResponse
from app.services.bank_account_service import BankAccountService

router = APIRouter(
    prefix="/businesses/{business_id}/bank-accounts",
    tags=["Bank Accounts"],
)

_ROLE_DEP = [Depends(require_role("admin", "super_admin"))]


@router.get("", response_model=BankAccountListResponse, dependencies=_ROLE_DEP)
async def list_bank_accounts(
    business_id: str,
    db: AsyncSession = Depends(get_db),
) -> BankAccountListResponse:
    return await BankAccountService(db).list_accounts(business_id)


@router.post("", response_model=BankAccountResponse, status_code=status.HTTP_201_CREATED, dependencies=_ROLE_DEP)
async def create_bank_account(
    business_id: str,
    body: BankAccountCreate,
    db: AsyncSession = Depends(get_db),
) -> BankAccountResponse:
    return await BankAccountService(db).create_account(
        business_id=business_id,
        name=body.name,
        opening_balance=body.opening_balance,
        description=body.description,
    )


@router.get("/total", dependencies=_ROLE_DEP)
async def get_total(
    business_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    total = await BankAccountService(db).get_total(business_id)
    return {"total": total}


@router.get("/{bank_account_id}", response_model=BankAccountResponse, dependencies=_ROLE_DEP)
async def get_bank_account(
    business_id: str,
    bank_account_id: str,
    db: AsyncSession = Depends(get_db),
) -> BankAccountResponse:
    return await BankAccountService(db).get_account(business_id, bank_account_id)


@router.put("/{bank_account_id}", response_model=BankAccountResponse, dependencies=_ROLE_DEP)
async def update_bank_account(
    business_id: str,
    bank_account_id: str,
    body: BankAccountUpdate,
    db: AsyncSession = Depends(get_db),
) -> BankAccountResponse:
    return await BankAccountService(db).update_account(
        business_id=business_id,
        bank_account_id=bank_account_id,
        name=body.name,
        description=body.description,
        update_description="description" in body.model_fields_set,
    )


@router.delete("/{bank_account_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=_ROLE_DEP)
async def delete_bank_account(
    business_id: str,
    bank_account_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    await BankAccountService(db).delete_account(business_id, bank_account_id)
