"""Late payment fees endpoints (B4, PR-31): documents, proposals and the batch confirm."""

import datetime as dt
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_idempotency_key
from app.core.pagination import PageParams, page_params
from app.schemas.request.journal_entry import DocumentActionRequest
from app.schemas.request.sales import ConfirmLateFeesRequest, CreateLateFeeRequest, UpdateLateFeeRequest
from app.schemas.response.sales import (
    ConfirmLateFeesResponse,
    LateFeeListResponse,
    LateFeeProposalsResponse,
    LateFeeResponse,
)
from app.services.access_service import BusinessContext
from app.services.idempotency_service import IdempotencyService, business_scope
from app.services.late_payment_fee_service import AREA, LatePaymentFeeService

PATH = "late-payment-fees"
router = APIRouter(prefix=f"/businesses/{{business_id}}/{PATH}", tags=["Late payment fees"])
view = require_business_access(AREA, AreaRight.VIEW)


@router.get("", response_model=LateFeeListResponse)
async def list_fees(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(view),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> LateFeeListResponse:
    return await LatePaymentFeeService(db).list_page(ctx.business_id, params)


@router.post("", response_model=LateFeeResponse, status_code=status.HTTP_201_CREATED)
async def create_fee(
    body: CreateLateFeeRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> LateFeeResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, f"POST {PATH}"), body, lambda: LatePaymentFeeService(db).create(ctx, body))


@router.get("/proposals", response_model=LateFeeProposalsResponse)
async def list_proposals(
    as_of: Optional[dt.date] = Query(None),
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(view),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> LateFeeProposalsResponse:
    """Fees due: the day after each due date, then monthly, up to as_of (default today)."""
    return await LatePaymentFeeService(db).proposals(ctx.business_id, as_of or dt.date.today(), params)


@router.post("/proposals/confirm", response_model=ConfirmLateFeesResponse, status_code=status.HTTP_201_CREATED)
async def confirm_proposals(
    body: ConfirmLateFeesRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ConfirmLateFeesResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, f"POST {PATH}/proposals/confirm"), body,
        lambda: LatePaymentFeeService(db).confirm(ctx, body))


@router.get("/{document_id}", response_model=LateFeeResponse)
async def get_fee(
    document_id: str,
    ctx: BusinessContext = Depends(view),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> LateFeeResponse:
    return await LatePaymentFeeService(db).get(ctx.business_id, document_id)


@router.put("/{document_id}", response_model=LateFeeResponse)
async def update_fee(
    document_id: str,
    body: UpdateLateFeeRequest,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> LateFeeResponse:
    return await LatePaymentFeeService(db).update(ctx, document_id, body)


@router.post("/{document_id}/post", response_model=LateFeeResponse)
async def post_fee(
    document_id: str,
    body: DocumentActionRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> LateFeeResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, f"POST {PATH}/{document_id}/post"), body,
        lambda: LatePaymentFeeService(db).post(ctx, document_id, body.version), status_code=status.HTTP_200_OK)


@router.post("/{document_id}/void", response_model=LateFeeResponse)
async def void_fee(
    document_id: str,
    body: DocumentActionRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> LateFeeResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, f"POST {PATH}/{document_id}/void"), body,
        lambda: LatePaymentFeeService(db).void(ctx, document_id, body.version), status_code=status.HTTP_200_OK)
