"""Customers and suppliers endpoints (one router per contact kind, same rules)."""

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_idempotency_key
from app.core.pagination import SEARCH_MAX, PageParams, page_params
from app.schemas.common import PaginatedResponse
from app.schemas.request.contact import ContactCreate, ContactUpdate
from app.schemas.response.contact import ContactResponse
from app.schemas.response.receipt import ReceiptResponse
from app.services.access_service import BusinessContext
from app.services.contact_service import CUSTOMERS, SUPPLIERS, ContactKind, ContactService
from app.services.idempotency_service import IdempotencyService, business_scope
from app.services.receipt_service import ReceiptService


def build_contact_router(kind: ContactKind) -> APIRouter:
    router = APIRouter(
        prefix=f"/businesses/{{business_id}}/{kind.area_key}", tags=[kind.label + "s"]
    )
    view = require_business_access(kind.area_key, AreaRight.VIEW)
    receipts_view = require_business_access("receipts", AreaRight.VIEW)

    @router.get("", response_model=PaginatedResponse[ContactResponse])
    async def list_contacts(
        params: PageParams = Depends(page_params),
        search: Optional[str] = Query(None, max_length=SEARCH_MAX),
        ctx: BusinessContext = Depends(view),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> PaginatedResponse[ContactResponse]:
        return await ContactService(db, kind).list_page(ctx.business_id, search, params)

    @router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
    async def create_contact(
        body: ContactCreate,
        key: str = Depends(require_idempotency_key),
        ctx: BusinessContext = Depends(require_business_access(kind.area_key, AreaRight.CREATE)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> ContactResponse:
        return await IdempotencyService(db).run(
            business_scope(ctx, key, kind.area_key, f"POST {kind.area_key}"),
            body,
            lambda: ContactService(db, kind).create(ctx, body),
        )

    @router.get("/{contact_id}", response_model=ContactResponse)
    async def get_contact(
        contact_id: str,
        ctx: BusinessContext = Depends(view),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> ContactResponse:
        return await ContactService(db, kind).get(ctx.business_id, contact_id)

    @router.get("/{contact_id}/receipts", response_model=PaginatedResponse[ReceiptResponse])
    async def list_contact_receipts(
        contact_id: str,
        params: PageParams = Depends(page_params),
        ctx: BusinessContext = Depends(view),
        _receipts: BusinessContext = Depends(receipts_view),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> PaginatedResponse[ReceiptResponse]:
        await ContactService(db, kind).get(ctx.business_id, contact_id)
        return await ReceiptService(db).list_page(ctx.business_id, params, (kind.key, contact_id))

    @router.put("/{contact_id}", response_model=ContactResponse)
    async def update_contact(
        contact_id: str,
        body: ContactUpdate,
        ctx: BusinessContext = Depends(require_business_access(kind.area_key, AreaRight.EDIT)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> ContactResponse:
        return await ContactService(db, kind).update(ctx, contact_id, body)

    @router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_contact(
        contact_id: str,
        version: int = Query(..., ge=1),
        ctx: BusinessContext = Depends(require_business_access(kind.area_key, AreaRight.DELETE)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> None:
        await ContactService(db, kind).delete(ctx, contact_id, version)

    return router


customers_router = build_contact_router(CUSTOMERS)
suppliers_router = build_contact_router(SUPPLIERS)
