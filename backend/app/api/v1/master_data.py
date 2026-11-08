"""Tax codes (settings, single rate in B4) and non-inventory items endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_idempotency_key
from app.core.pagination import SEARCH_MAX, PageParams, page_params
from app.schemas.request.sales import CreateItemRequest, CreateTaxCodeRequest, UpdateItemRequest, UpdateTaxCodeRequest
from app.schemas.response.sales import ItemListResponse, ItemResponse, TaxCodeListResponse, TaxCodeResponse
from app.services.access_service import BusinessContext
from app.services.idempotency_service import IdempotencyService, business_scope
from app.services.master_data_service import MasterDataService

TAX, ITEMS = "settings.tax_codes", "non_inventory_items"
router = APIRouter(prefix="/businesses/{business_id}", tags=["Tax codes and items"])


@router.get("/tax-codes", response_model=TaxCodeListResponse)
async def list_tax_codes(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(TAX, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TaxCodeListResponse:
    return await MasterDataService(db).list_tax_codes(ctx.business_id, params)


@router.post("/tax-codes", response_model=TaxCodeResponse, status_code=status.HTTP_201_CREATED)
async def create_tax_code(
    body: CreateTaxCodeRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(TAX, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TaxCodeResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, TAX, "POST tax-codes"), body, lambda: MasterDataService(db).create_tax_code(ctx, body))


@router.get("/tax-codes/{tax_code_id}", response_model=TaxCodeResponse)
async def get_tax_code(
    tax_code_id: str,
    ctx: BusinessContext = Depends(require_business_access(TAX, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TaxCodeResponse:
    return await MasterDataService(db).get_tax_code(ctx.business_id, tax_code_id)


@router.put("/tax-codes/{tax_code_id}", response_model=TaxCodeResponse)
async def update_tax_code(
    tax_code_id: str,
    body: UpdateTaxCodeRequest,
    ctx: BusinessContext = Depends(require_business_access(TAX, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TaxCodeResponse:
    return await MasterDataService(db).update_tax_code(ctx, tax_code_id, body)


@router.delete("/tax-codes/{tax_code_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tax_code(
    tax_code_id: str,
    version: int = Query(..., ge=1),
    ctx: BusinessContext = Depends(require_business_access(TAX, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> None:
    await MasterDataService(db).delete_tax_code(ctx, tax_code_id, version)


@router.get("/non-inventory-items", response_model=ItemListResponse)
async def list_items(
    params: PageParams = Depends(page_params),
    search: Optional[str] = Query(None, max_length=SEARCH_MAX),
    ctx: BusinessContext = Depends(require_business_access(ITEMS, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ItemListResponse:
    return await MasterDataService(db).list_items(ctx.business_id, search, params)


@router.post("/non-inventory-items", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(
    body: CreateItemRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(ITEMS, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ItemResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, ITEMS, "POST non-inventory-items"), body,
        lambda: MasterDataService(db).create_item(ctx, body))


@router.get("/non-inventory-items/{item_id}", response_model=ItemResponse)
async def get_item(
    item_id: str,
    ctx: BusinessContext = Depends(require_business_access(ITEMS, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ItemResponse:
    return await MasterDataService(db).get_item(ctx.business_id, item_id)


@router.put("/non-inventory-items/{item_id}", response_model=ItemResponse)
async def update_item(
    item_id: str,
    body: UpdateItemRequest,
    ctx: BusinessContext = Depends(require_business_access(ITEMS, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ItemResponse:
    return await MasterDataService(db).update_item(ctx, item_id, body)


@router.delete("/non-inventory-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: str,
    version: int = Query(..., ge=1),
    ctx: BusinessContext = Depends(require_business_access(ITEMS, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> None:
    await MasterDataService(db).delete_item(ctx, item_id, version)
