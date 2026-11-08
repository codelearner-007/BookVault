"""Customers endpoints (B4: AR balance, credit, transactions, open invoices)."""

import datetime as dt
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_idempotency_key
from app.core.pagination import SEARCH_MAX, PageParams, page_params
from app.schemas.request.sales import CreateCustomerRequest, UpdateCustomerRequest
from app.schemas.response.sales import (
    CustomerListResponse,
    CustomerResponse,
    CustomerTransactionsResponse,
    OpenInvoicesResponse,
)
from app.services.access_service import BusinessContext
from app.services.customer_service import CustomerService
from app.services.idempotency_service import IdempotencyService, business_scope

AREA = "customers"
router = APIRouter(prefix=f"/businesses/{{business_id}}/{AREA}", tags=["Customers"])
view = require_business_access(AREA, AreaRight.VIEW)


@router.get("", response_model=CustomerListResponse)
async def list_customers(
    params: PageParams = Depends(page_params),
    search: Optional[str] = Query(None, max_length=SEARCH_MAX),
    ctx: BusinessContext = Depends(view),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CustomerListResponse:
    return await CustomerService(db).list_page(ctx.business_id, search, params)


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CreateCustomerRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CustomerResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, f"POST {AREA}"), body, lambda: CustomerService(db).create(ctx, body))


@router.get("/{contact_id}", response_model=CustomerResponse)
async def get_customer(
    contact_id: str,
    ctx: BusinessContext = Depends(view),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CustomerResponse:
    return await CustomerService(db).get(ctx.business_id, contact_id)


@router.get("/{contact_id}/transactions", response_model=CustomerTransactionsResponse)
async def list_customer_transactions(
    contact_id: str,
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(view),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CustomerTransactionsResponse:
    """Documents that moved the customer's Accounts receivable (signed amount)."""
    return await CustomerService(db).transactions(ctx.business_id, contact_id, params)


@router.get("/{contact_id}/open-invoices", response_model=OpenInvoicesResponse)
async def list_customer_open_invoices(
    contact_id: str,
    as_of: Optional[dt.date] = Query(None),
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access("receipts", AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> OpenInvoicesResponse:
    """Receipt allocation panel: open invoices oldest first with the early-payment discount hint."""
    return await CustomerService(db).open_invoices(ctx.business_id, contact_id, as_of or dt.date.today(), params)


@router.put("/{contact_id}", response_model=CustomerResponse)
async def update_customer(
    contact_id: str,
    body: UpdateCustomerRequest,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CustomerResponse:
    return await CustomerService(db).update(ctx, contact_id, body)


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    contact_id: str,
    version: int = Query(..., ge=1),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> None:
    await CustomerService(db).delete(ctx, contact_id, version)
