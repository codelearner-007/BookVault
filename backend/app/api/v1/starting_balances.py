"""Starting balances: balance-sheet accounts (B2), bank and cash accounts (B3), sales invoices (B4),
purchase invoices (B5)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access
from app.core.pagination import PageParams, page_params
from app.schemas.common import IdStr
from app.schemas.request.starting_balance import SetAccountStartingBalanceRequest
from app.schemas.response.coa import (
    BankStartingBalanceItem,
    BankStartingBalancesResponse,
    StartingBalanceItem,
    StartingBalancesResponse,
)
from app.services.access_service import BusinessContext
from app.schemas.request.sales import SetInvoiceStartingBalanceRequest
from app.schemas.response.sales import InvoiceStartingBalanceItem, InvoiceStartingBalancesResponse
from app.schemas.response.purchases import (
    PurchaseInvoiceStartingBalanceItem,
    PurchaseInvoiceStartingBalancesResponse,
)
from app.services.invoice_opening_service import InvoiceOpeningService
from app.services.opening_balance_service import AREA, OpeningBalanceService
from app.services.trade_types import PURCHASES

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


@router.get("/bank-accounts", response_model=BankStartingBalancesResponse)
async def list_bank_starting_balances(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> BankStartingBalancesResponse:
    return await OpeningBalanceService(db).list_bank_accounts(ctx.business_id, params)


@router.put("/bank-accounts/{bank_account_id}", response_model=BankStartingBalanceItem)
async def set_bank_starting_balance(
    bank_account_id: IdStr,
    body: SetAccountStartingBalanceRequest,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> BankStartingBalanceItem:
    """T67: one two-line opening entry per bank or cash account (void + re-post on change)."""
    return await OpeningBalanceService(db).set_bank_account(ctx, bank_account_id, body)


@router.get("/sales-invoices", response_model=InvoiceStartingBalancesResponse)
async def list_invoice_starting_balances(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> InvoiceStartingBalancesResponse:
    """Starting-balance sales invoices (PR-61, D-36) with what was paid before the books start."""
    return await InvoiceOpeningService(db).list_page(ctx.business_id, params)


@router.put("/sales-invoices/{invoice_id}", response_model=InvoiceStartingBalanceItem)
async def set_invoice_starting_balance(
    invoice_id: IdStr,
    body: SetInvoiceStartingBalanceRequest,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> InvoiceStartingBalanceItem:
    """Paid before start: void the invoice's opening document and post the new outstanding amount."""
    return await InvoiceOpeningService(db).set_paid(ctx, invoice_id, body.paid_before_start)


@router.get("/purchase-invoices", response_model=PurchaseInvoiceStartingBalancesResponse)
async def list_purchase_invoice_starting_balances(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> PurchaseInvoiceStartingBalancesResponse:
    """Starting-balance purchase invoices (PR-61, D-36) with what was paid before the books start."""
    return await InvoiceOpeningService(db, PURCHASES).list_page(ctx.business_id, params)


@router.put("/purchase-invoices/{invoice_id}", response_model=PurchaseInvoiceStartingBalanceItem)
async def set_purchase_invoice_starting_balance(
    invoice_id: IdStr,
    body: SetInvoiceStartingBalanceRequest,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> PurchaseInvoiceStartingBalanceItem:
    """Paid before start: void the invoice's opening document and post the new outstanding amount (Cr AP)."""
    return await InvoiceOpeningService(db, PURCHASES).set_paid(ctx, invoice_id, body.paid_before_start)
