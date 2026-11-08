"""Inventory endpoints (B6): inventory items, kits, locations, transfers, write-offs, production orders,
cost corrections and inventory starting balances."""

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_idempotency_key
from app.core.pagination import SEARCH_MAX, PageParams, page_params
from app.schemas.request.inventory import (
    CreateInventoryItemRequest,
    CreateKitRequest,
    CreateLocationRequest,
    CreateProductionOrderRequest,
    CreateTransferRequest,
    CreateWriteOffRequest,
    SetInventoryStartingBalanceRequest,
    UpdateInventoryItemRequest,
    UpdateKitRequest,
    UpdateLocationRequest,
    UpdateProductionOrderRequest,
    UpdateTransferRequest,
    UpdateWriteOffRequest,
)
from app.schemas.request.journal_entry import DocumentActionRequest
from app.schemas.response.inventory import (
    CostCorrectionListResponse,
    InventoryItemDetailResponse,
    InventoryItemListResponse,
    InventoryStartingBalanceItem,
    InventoryStartingBalancesResponse,
    KitListResponse,
    KitResponse,
    LocationListResponse,
    LocationResponse,
    StockDocumentListResponse,
    StockDocumentResponse,
    StockMovementListResponse,
)
from app.services.access_service import BusinessContext
from app.services.idempotency_service import IdempotencyService, business_scope
from app.services.inventory_opening_service import AREA as STARTING_BALANCES, InventoryOpeningService
from app.services.inventory_service import KIT, InventoryService
from app.services.stock_document_service import (
    PRODUCTION,
    STOCK_KINDS,
    TRANSFER,
    WRITE_OFF,
    StockDocumentService,
)

ITEMS, KITS, LOCATIONS = "inventory_items", "inventory_kits", "inventory_locations"
router = APIRouter(prefix="/businesses/{business_id}", tags=["Inventory"])


# ---------------------------------------------------------------- inventory items
@router.get("/inventory-items", response_model=InventoryItemListResponse)
async def list_inventory_items(
    params: PageParams = Depends(page_params),
    search: Optional[str] = Query(None, max_length=SEARCH_MAX),
    ctx: BusinessContext = Depends(require_business_access(ITEMS, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> InventoryItemListResponse:
    """Manager's widest list: qty owned / to deliver / to receive / on hand / reserved / available / on order /
    to be available / desired / to order, average and total cost (+ totals of every item)."""
    return await InventoryService(db).list_items(ctx.business_id, search, params)


@router.post("/inventory-items", response_model=InventoryItemDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_inventory_item(
    body: CreateInventoryItemRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(ITEMS, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> InventoryItemDetailResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, ITEMS, "POST inventory-items"), body,
        lambda: InventoryService(db).create_item(ctx, body))


@router.get("/inventory-items/{item_id}", response_model=InventoryItemDetailResponse)
async def get_inventory_item(
    item_id: str,
    ctx: BusinessContext = Depends(require_business_access(ITEMS, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> InventoryItemDetailResponse:
    return await InventoryService(db).get_item(ctx.business_id, item_id)


@router.put("/inventory-items/{item_id}", response_model=InventoryItemDetailResponse)
async def update_inventory_item(
    item_id: str,
    body: UpdateInventoryItemRequest,
    ctx: BusinessContext = Depends(require_business_access(ITEMS, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> InventoryItemDetailResponse:
    return await InventoryService(db).update_item(ctx, item_id, body)


@router.delete("/inventory-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inventory_item(
    item_id: str,
    version: int = Query(..., ge=1),
    ctx: BusinessContext = Depends(require_business_access(ITEMS, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> None:
    await InventoryService(db).delete_item(ctx, item_id, version)


@router.get("/inventory-items/{item_id}/movements", response_model=StockMovementListResponse)
async def list_inventory_item_movements(
    item_id: str,
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(ITEMS, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> StockMovementListResponse:
    return await InventoryService(db).movements(ctx.business_id, item_id, params)


@router.get("/inventory/cost-corrections", response_model=CostCorrectionListResponse)
async def list_cost_corrections(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(ITEMS, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CostCorrectionListResponse:
    """COGS entries re-posted after a back-dated stock change (PR-69)."""
    return await InventoryService(db).cost_corrections(ctx.business_id, params)


# ---------------------------------------------------------------- kits
@router.get("/inventory-kits", response_model=KitListResponse)
async def list_kits(
    params: PageParams = Depends(page_params),
    search: Optional[str] = Query(None, max_length=SEARCH_MAX),
    ctx: BusinessContext = Depends(require_business_access(KITS, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> KitListResponse:
    return await InventoryService(db).list_kits(ctx.business_id, search, params)


@router.post("/inventory-kits", response_model=KitResponse, status_code=status.HTTP_201_CREATED)
async def create_kit(
    body: CreateKitRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(KITS, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> KitResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, KITS, "POST inventory-kits"), body, lambda: InventoryService(db).create_kit(ctx, body))


@router.get("/inventory-kits/{item_id}", response_model=KitResponse)
async def get_kit(
    item_id: str,
    ctx: BusinessContext = Depends(require_business_access(KITS, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> KitResponse:
    return await InventoryService(db).get_kit(ctx.business_id, item_id)


@router.put("/inventory-kits/{item_id}", response_model=KitResponse)
async def update_kit(
    item_id: str,
    body: UpdateKitRequest,
    ctx: BusinessContext = Depends(require_business_access(KITS, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> KitResponse:
    return await InventoryService(db).update_kit(ctx, item_id, body)


@router.delete("/inventory-kits/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kit(
    item_id: str,
    version: int = Query(..., ge=1),
    ctx: BusinessContext = Depends(require_business_access(KITS, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> None:
    await InventoryService(db).delete_item(ctx, item_id, version, KIT)


# ---------------------------------------------------------------- locations
@router.get("/inventory-locations", response_model=LocationListResponse)
async def list_locations(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(LOCATIONS, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> LocationListResponse:
    return await InventoryService(db).list_locations(ctx.business_id, params)


@router.post("/inventory-locations", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
async def create_location(
    body: CreateLocationRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(LOCATIONS, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> LocationResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, LOCATIONS, "POST inventory-locations"), body,
        lambda: InventoryService(db).create_location(ctx, body))


@router.get("/inventory-locations/{location_id}", response_model=LocationResponse)
async def get_location(
    location_id: str,
    ctx: BusinessContext = Depends(require_business_access(LOCATIONS, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> LocationResponse:
    return await InventoryService(db).get_location(ctx.business_id, location_id)


@router.put("/inventory-locations/{location_id}", response_model=LocationResponse)
async def update_location(
    location_id: str,
    body: UpdateLocationRequest,
    ctx: BusinessContext = Depends(require_business_access(LOCATIONS, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> LocationResponse:
    return await InventoryService(db).update_location(ctx, location_id, body)


@router.delete("/inventory-locations/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_location(
    location_id: str,
    version: int = Query(..., ge=1),
    ctx: BusinessContext = Depends(require_business_access(LOCATIONS, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> None:
    await InventoryService(db).delete_location(ctx, location_id, version)


# ---------------------------------------------------------------- inventory starting balances (PR-62)
@router.get("/starting-balances/inventory-items", response_model=InventoryStartingBalancesResponse)
async def list_inventory_starting_balances(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(STARTING_BALANCES, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> InventoryStartingBalancesResponse:
    return await InventoryOpeningService(db).list_items(ctx.business_id, params)


@router.put("/starting-balances/inventory-items/{item_id}", response_model=InventoryStartingBalanceItem)
async def set_inventory_starting_balance(
    item_id: str,
    body: SetInventoryStartingBalanceRequest,
    ctx: BusinessContext = Depends(require_business_access(STARTING_BALANCES, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> InventoryStartingBalanceItem:
    """Qty on hand per location + total cost: one opening entry, Dr Inventory on hand / Cr Retained earnings."""
    return await InventoryOpeningService(db).set_item(ctx, item_id, body)


# ---------------------------------------------------------------- transfers, write-offs, production orders
BODIES = {
    TRANSFER: (CreateTransferRequest, UpdateTransferRequest),
    WRITE_OFF: (CreateWriteOffRequest, UpdateWriteOffRequest),
    PRODUCTION: (CreateProductionOrderRequest, UpdateProductionOrderRequest),
}


def build_stock_router(type_key: str) -> APIRouter:
    kind = STOCK_KINDS[type_key]
    area, create_body, update_body = kind.area, *BODIES[type_key]
    stock_router = APIRouter(prefix=f"/businesses/{{business_id}}/{kind.path}", tags=[kind.entity])

    def service(db: AsyncSession) -> StockDocumentService:
        return StockDocumentService(db, kind)

    @stock_router.get("", response_model=StockDocumentListResponse)
    async def list_stock_documents(
        search: Optional[str] = Query(None, max_length=SEARCH_MAX),
        params: PageParams = Depends(page_params),
        ctx: BusinessContext = Depends(require_business_access(area, AreaRight.VIEW)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> StockDocumentListResponse:
        return await service(db).list_page(ctx.business_id, params, search)

    @stock_router.post("", response_model=StockDocumentResponse, status_code=status.HTTP_201_CREATED)
    async def create_stock_document(
        body: create_body,
        key: str = Depends(require_idempotency_key),
        ctx: BusinessContext = Depends(require_business_access(area, AreaRight.CREATE)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> StockDocumentResponse:
        return await IdempotencyService(db).run(
            business_scope(ctx, key, area, f"POST {kind.path}"), body, lambda: service(db).create(ctx, body))

    @stock_router.get("/{document_id}", response_model=StockDocumentResponse)
    async def get_stock_document(
        document_id: str,
        ctx: BusinessContext = Depends(require_business_access(area, AreaRight.VIEW)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> StockDocumentResponse:
        return await service(db).get(ctx.business_id, document_id)

    @stock_router.put("/{document_id}", response_model=StockDocumentResponse)
    async def update_stock_document(
        document_id: str,
        body: update_body,
        ctx: BusinessContext = Depends(require_business_access(area, AreaRight.EDIT)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> StockDocumentResponse:
        return await service(db).update(ctx, document_id, body)

    @stock_router.post("/{document_id}/post", response_model=StockDocumentResponse)
    async def post_stock_document(
        document_id: str,
        body: DocumentActionRequest,
        key: str = Depends(require_idempotency_key),
        ctx: BusinessContext = Depends(require_business_access(area, AreaRight.EDIT)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> StockDocumentResponse:
        return await IdempotencyService(db).run(
            business_scope(ctx, key, area, f"POST {kind.path}/{document_id}/post"), body,
            lambda: service(db).post(ctx, document_id, body.version), status_code=status.HTTP_200_OK)

    @stock_router.post("/{document_id}/void", response_model=StockDocumentResponse)
    async def void_stock_document(
        document_id: str,
        body: DocumentActionRequest,
        key: str = Depends(require_idempotency_key),
        ctx: BusinessContext = Depends(require_business_access(area, AreaRight.DELETE)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> StockDocumentResponse:
        """Posted: reversal entry + void (PR-74), stock moves back and later costs are corrected."""
        return await IdempotencyService(db).run(
            business_scope(ctx, key, area, f"POST {kind.path}/{document_id}/void"), body,
            lambda: service(db).void(ctx, document_id, body.version), status_code=status.HTTP_200_OK)

    return stock_router


stock_routers = [build_stock_router(k) for k in BODIES]
