"""Starting balances: balance-sheet accounts (B2; bank, invoices, items... in later phases)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access
from app.core.pagination import PageParams, page_params
from app.schemas.common import IdStr
from app.schemas.request.starting_balance import SetAccountStartingBalanceRequest
from app.schemas.response.coa import StartingBalanceItem, StartingBalancesResponse
from app.services.access_service import BusinessContext
from app.services.opening_balance_service import AREA, OpeningBalanceService

router = APIRouter(prefix="/businesses/{business_id}/starting-balances", tags=["Starting Balances"])


@router.get("/accounts", response_model=StartingBalancesResponse)
async def list_account_starting_balances(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> StartingBalancesResponse:
    return await OpeningBalanceService(db).list_accounts(ctx.business_id, params)


@router.put("/accounts/{account_id}", response_model=StartingBalanceItem)
async def set_account_starting_balance(
    account_id: IdStr,
    body: SetAccountStartingBalanceRequest,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> StartingBalanceItem:
    """Set-to-value: void the account's opening entry (if any) and post the new one; 0 removes it."""
    return await OpeningBalanceService(db).set_account(ctx, account_id, body)
