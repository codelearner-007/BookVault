"""Sales trade-document endpoints (B4): one router per type, same shape; early discounts; sales settings."""

import datetime as dt
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_idempotency_key
from app.core.pagination import SEARCH_MAX, PageParams, page_params
from app.schemas.common import IdStr
from app.schemas.request.journal_entry import DocumentActionRequest
from app.schemas.request.sales import (
    CopyToRequest,
    CreateCreditNoteRequest,
    CreateDeliveryNoteRequest,
    CreateInvoiceRequest,
    CreateOrderRequest,
    CreateQuoteRequest,
    PostTradeDocumentRequest,
    TradeTotalsRequest,
    UpdateCreditNoteRequest,
    UpdateDeliveryNoteRequest,
    UpdateInvoiceRequest,
    UpdateOrderRequest,
    UpdateQuoteRequest,
    UpdateSalesSettingsRequest,
)
from app.schemas.response.sales import (
    CopyToResponse,
    EarlyDiscountListResponse,
    SalesSettingsResponse,
    TradeDocumentListResponse,
    TradeDocumentResponse,
    TradeLineReportResponse,
    TradeTotalsResponse,
)
from app.services.access_service import BusinessContext
from app.services.customer_service import CustomerService
from app.services.idempotency_service import IdempotencyService, business_scope
from app.services.sales_settings_service import SalesSettingsService
from app.services.trade_document_service import TradeDocumentService
from app.services.trade_types import CREDIT_NOTE, DELIVERY_NOTE, INVOICE, ORDER, QUOTE, TRADE_TYPES

BODIES = {
    QUOTE: (CreateQuoteRequest, UpdateQuoteRequest),
    ORDER: (CreateOrderRequest, UpdateOrderRequest),
    INVOICE: (CreateInvoiceRequest, UpdateInvoiceRequest),
    CREDIT_NOTE: (CreateCreditNoteRequest, UpdateCreditNoteRequest),
    DELIVERY_NOTE: (CreateDeliveryNoteRequest, UpdateDeliveryNoteRequest),
}


def build_trade_router(type_key: str) -> APIRouter:
    kind = TRADE_TYPES[type_key]
    area, create_body, update_body = kind.area, *BODIES[type_key]
    router = APIRouter(prefix=f"/businesses/{{business_id}}/{kind.path}", tags=[kind.entity])
    view = require_business_access(area, AreaRight.VIEW)

    def service(db: AsyncSession) -> TradeDocumentService:
        return TradeDocumentService(db, kind)

    @router.get("", response_model=TradeDocumentListResponse)
    async def list_documents(
        customer_id: IdStr | None = Query(None),
        search: Optional[str] = Query(None, max_length=SEARCH_MAX),
        params: PageParams = Depends(page_params),
        ctx: BusinessContext = Depends(view),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> TradeDocumentListResponse:
        return await service(db).list_page(ctx.business_id, params, customer_id, search)

    @router.post("", response_model=TradeDocumentResponse, status_code=status.HTTP_201_CREATED)
    async def create_document(
        body: create_body,
        key: str = Depends(require_idempotency_key),
        ctx: BusinessContext = Depends(require_business_access(area, AreaRight.CREATE)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> TradeDocumentResponse:
        return await IdempotencyService(db).run(
            business_scope(ctx, key, area, f"POST {kind.path}"), body, lambda: service(db).create(ctx, body))

    @router.post("/totals", response_model=TradeTotalsResponse)
    async def document_totals(
        body: TradeTotalsRequest,
        ctx: BusinessContext = Depends(view),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> TradeTotalsResponse:
        """Line amounts, tax and total of the form, rounded like a posting (no write)."""
        return await service(db).totals(ctx.business_id, body)

    @router.get("/lines", response_model=TradeLineReportResponse)
    async def list_lines(
        params: PageParams = Depends(page_params),
        ctx: BusinessContext = Depends(view),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> TradeLineReportResponse:
        return await service(db).lines_report(ctx.business_id, params)

    if type_key == INVOICE:
        @router.get("/early-payment-discounts", response_model=EarlyDiscountListResponse)
        async def list_early_payment_discounts(
            as_of: Optional[dt.date] = Query(None),
            params: PageParams = Depends(page_params),
            ctx: BusinessContext = Depends(view),
            db: AsyncSession = Depends(get_db, scope="function"),
        ) -> EarlyDiscountListResponse:
            """Invoices whose early-payment discount window is open (PR-22; it posts on the receipt)."""
            return await CustomerService(db).early_discounts(ctx.business_id, as_of or dt.date.today(), params)

    @router.get("/{document_id}", response_model=TradeDocumentResponse)
    async def get_document(
        document_id: str,
        ctx: BusinessContext = Depends(view),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> TradeDocumentResponse:
        return await service(db).get(ctx.business_id, document_id)

    @router.put("/{document_id}", response_model=TradeDocumentResponse)
    async def update_document(
        document_id: str,
        body: update_body,
        ctx: BusinessContext = Depends(require_business_access(area, AreaRight.EDIT)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> TradeDocumentResponse:
        return await service(db).update(ctx, document_id, body)

    @router.post("/{document_id}/post", response_model=TradeDocumentResponse)
    async def post_document(
        document_id: str,
        body: PostTradeDocumentRequest,
        key: str = Depends(require_idempotency_key),
        ctx: BusinessContext = Depends(require_business_access(area, AreaRight.EDIT)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> TradeDocumentResponse:
        return await IdempotencyService(db).run(
            business_scope(ctx, key, area, f"POST {kind.path}/{document_id}/post"), body,
            lambda: service(db).post(ctx, document_id, body.version, body.credit_limit_override),
            status_code=status.HTTP_200_OK)

    @router.post("/{document_id}/void", response_model=TradeDocumentResponse)
    async def void_document(
        document_id: str,
        body: DocumentActionRequest,
        key: str = Depends(require_idempotency_key),
        ctx: BusinessContext = Depends(require_business_access(area, AreaRight.DELETE)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> TradeDocumentResponse:
        """Posted: reversal entry + void (PR-74); quotes and orders: cancelled. Draft: discarded."""
        return await IdempotencyService(db).run(
            business_scope(ctx, key, area, f"POST {kind.path}/{document_id}/void"), body,
            lambda: service(db).void(ctx, document_id, body.version), status_code=status.HTTP_200_OK)

    if kind.copy_to:
        @router.post("/{document_id}/copy-to", response_model=CopyToResponse)
        async def copy_document(
            document_id: str,
            body: CopyToRequest,
            ctx: BusinessContext = Depends(view),
            db: AsyncSession = Depends(get_db, scope="function"),
        ) -> CopyToResponse:
            """A prefilled create body for the target form (no write; the link is made on save)."""
            return await service(db).copy_to(ctx.business_id, document_id, body.target)

    return router


trade_routers = [build_trade_router(k) for k in BODIES]

router = APIRouter(prefix="/businesses/{business_id}", tags=["Sales"])


@router.get("/settings/sales", response_model=SalesSettingsResponse)
async def get_sales_settings(
    ctx: BusinessContext = Depends(require_business_access("settings.business_details", AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> SalesSettingsResponse:
    return await SalesSettingsService(db).get(ctx.business_id)


@router.put("/settings/sales", response_model=SalesSettingsResponse)
async def update_sales_settings(
    body: UpdateSalesSettingsRequest,
    ctx: BusinessContext = Depends(require_business_access("settings.business_details", AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> SalesSettingsResponse:
    """BUG-05: credit-limit policy (warn = confirm with an override; block = 409)."""
    return await SalesSettingsService(db).update(ctx, body)

