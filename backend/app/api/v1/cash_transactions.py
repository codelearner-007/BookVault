"""Receipts and payments endpoints (B3): one router per direction, same rules."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_idempotency_key
from app.core.pagination import PageParams, page_params
from app.schemas.common import IdStr
from app.schemas.request.cash_transaction import (
    CashTotalsRequest,
    CreateCashTransactionRequest,
    UpdateCashTransactionRequest,
)
from app.schemas.request.journal_entry import DocumentActionRequest
from app.schemas.response.cash_transaction import (
    CashLineReportResponse,
    CashTotalsResponse,
    CashTransactionListResponse,
    CashTransactionResponse,
)
from app.services.access_service import BusinessContext
from app.services.cash_transaction_service import AREAS, PAYMENT, RECEIPT, CashTransactionService
from app.services.idempotency_service import IdempotencyService, business_scope


def build_cash_router(direction: str) -> APIRouter:
    area = AREAS[direction]
    router = APIRouter(prefix=f"/businesses/{{business_id}}/{area}", tags=[area.capitalize()])
    view = require_business_access(area, AreaRight.VIEW)

    def service(db: AsyncSession) -> CashTransactionService:
        return CashTransactionService(db, direction)

    @router.get("", response_model=CashTransactionListResponse)
    async def list_documents(
        bank_account_id: IdStr | None = Query(None),
        params: PageParams = Depends(page_params),
        ctx: BusinessContext = Depends(view),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> CashTransactionListResponse:
        return await service(db).list_page(ctx.business_id, params, bank_account_id)

    @router.post("", response_model=CashTransactionResponse, status_code=status.HTTP_201_CREATED)
    async def create_document(
        body: CreateCashTransactionRequest,
        key: str = Depends(require_idempotency_key),
        ctx: BusinessContext = Depends(require_business_access(area, AreaRight.CREATE)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> CashTransactionResponse:
        return await IdempotencyService(db).run(
            business_scope(ctx, key, area, f"POST {area}"), body, lambda: service(db).create(ctx, body),
        )

    @router.post("/totals", response_model=CashTotalsResponse)
    async def document_totals(
        body: CashTotalsRequest,
        ctx: BusinessContext = Depends(view),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> CashTotalsResponse:
        """Line amounts and total of the form, rounded like a posting (no write)."""
        return await service(db).totals(ctx.business_id, body.lines)

    @router.get("/lines", response_model=CashLineReportResponse)
    async def list_lines(
        params: PageParams = Depends(page_params),
        ctx: BusinessContext = Depends(view),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> CashLineReportResponse:
        """Manager's "Receipt - Lines" / "Payment - Lines": every line of posted documents."""
        return await service(db).lines_report(ctx.business_id, params)

    @router.get("/{document_id}", response_model=CashTransactionResponse)
    async def get_document(
        document_id: str,
        ctx: BusinessContext = Depends(view),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> CashTransactionResponse:
        return await service(db).get(ctx.business_id, document_id)

    @router.put("/{document_id}", response_model=CashTransactionResponse)
    async def update_document(
        document_id: str,
        body: UpdateCashTransactionRequest,
        ctx: BusinessContext = Depends(require_business_access(area, AreaRight.EDIT)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> CashTransactionResponse:
        return await service(db).update(ctx, document_id, body)

    @router.post("/{document_id}/post", response_model=CashTransactionResponse)
    async def post_document(
        document_id: str,
        body: DocumentActionRequest,
        key: str = Depends(require_idempotency_key),
        ctx: BusinessContext = Depends(require_business_access(area, AreaRight.EDIT)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> CashTransactionResponse:
        return await IdempotencyService(db).run(
            business_scope(ctx, key, area, f"POST {area}/{document_id}/post"), body,
            lambda: service(db).post(ctx, document_id, body.version), status_code=status.HTTP_200_OK,
        )

    @router.post("/{document_id}/void", response_model=CashTransactionResponse)
    async def void_document(
        document_id: str,
        body: DocumentActionRequest,
        key: str = Depends(require_idempotency_key),
        ctx: BusinessContext = Depends(require_business_access(area, AreaRight.DELETE)),
        db: AsyncSession = Depends(get_db, scope="function"),
    ) -> CashTransactionResponse:
        """Posted: reversal entry + status void (PR-74). Draft: discarded, no ledger effect."""
        return await IdempotencyService(db).run(
            business_scope(ctx, key, area, f"POST {area}/{document_id}/void"), body,
            lambda: service(db).void(ctx, document_id, body.version), status_code=status.HTTP_200_OK,
        )

    return router


receipts_router = build_cash_router(RECEIPT)
payments_router = build_cash_router(PAYMENT)
