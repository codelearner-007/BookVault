"""Suppliers endpoints (B5: AP balance, credit, transactions, open purchase invoices)."""

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_idempotency_key
from app.core.pagination import SEARCH_MAX, PageParams, page_params
from app.schemas.request.purchases import CreateSupplierRequest, UpdateSupplierRequest
from app.schemas.response.purchases import OpenPurchaseInvoicesResponse, SupplierListResponse, SupplierResponse
from app.schemas.response.sales import CustomerTransactionsResponse
from app.services.access_service import BusinessContext
from app.services.idempotency_service import IdempotencyService, business_scope
from app.services.supplier_service import SupplierService

AREA = "suppliers"
router = APIRouter(prefix=f"/businesses/{{business_id}}/{AREA}", tags=["Suppliers"])
view = require_business_access(AREA, AreaRight.VIEW)


@router.get("", response_model=SupplierListResponse)
async def list_suppliers(
    params: PageParams = Depends(page_params),
    search: Optional[str] = Query(None, max_length=SEARCH_MAX),
    ctx: BusinessContext = Depends(view),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> SupplierListResponse:
    return await SupplierService(db).list_page(ctx.business_id, search, params)


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    body: CreateSupplierRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> SupplierResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, f"POST {AREA}"), body, lambda: SupplierService(db).create(ctx, body))


@router.get("/{contact_id}", response_model=SupplierResponse)
async def get_supplier(
    contact_id: str,
    ctx: BusinessContext = Depends(view),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> SupplierResponse:
    return await SupplierService(db).get(ctx.business_id, contact_id)


@router.get("/{contact_id}/transactions", response_model=CustomerTransactionsResponse)
async def list_supplier_transactions(
    contact_id: str,
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(view),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CustomerTransactionsResponse:
    """Documents that moved the supplier's Accounts payable (signed, credit positive)."""
    return await SupplierService(db).transactions(ctx.business_id, contact_id, params)


@router.get("/{contact_id}/open-invoices", response_model=OpenPurchaseInvoicesResponse)
async def list_supplier_open_invoices(
    contact_id: str,
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access("payments", AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> OpenPurchaseInvoicesResponse:
    """Payment allocation panel: open purchase invoices oldest first (closed ones left out)."""
    return await SupplierService(db).open_invoices(ctx.business_id, contact_id, params)


@router.put("/{contact_id}", response_model=SupplierResponse)
async def update_supplier(
    contact_id: str,
    body: UpdateSupplierRequest,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> SupplierResponse:
    return await SupplierService(db).update(ctx, contact_id, body)


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier(
    contact_id: str,
    version: int = Query(..., ge=1),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> None:
    await SupplierService(db).delete(ctx, contact_id, version)
