"""Withholding tax endpoints (B7): receipts (PR-36) and the WHT settings (BUG-01, D-27)."""

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_business_member, require_idempotency_key
from app.core.pagination import PageParams, page_params
from app.schemas.request.journal_entry import DocumentActionRequest
from app.schemas.request.withholding_tax import (
    CreateWithholdingTaxReceiptRequest,
    UpdateWithholdingTaxReceiptRequest,
    UpdateWithholdingTaxSettingsRequest,
)
from app.schemas.response.withholding_tax import (
    WithholdingTaxReceiptListResponse,
    WithholdingTaxReceiptResponse,
    WithholdingTaxSettingsResponse,
)
from app.services.access_service import BusinessContext
from app.services.idempotency_service import IdempotencyService, business_scope
from app.services.withholding_tax_service import AREA, WithholdingTaxService

PATH = "withholding-tax-receipts"
SETTINGS_AREA = "settings.business_details"
router = APIRouter(prefix="/businesses/{business_id}", tags=["Withholding tax"])
view = require_business_access(AREA, AreaRight.VIEW)


@router.get(f"/{PATH}", response_model=WithholdingTaxReceiptListResponse)
async def list_receipts(
    customer_id: Optional[str] = Query(None, max_length=64),
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(view),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> WithholdingTaxReceiptListResponse:
    return await WithholdingTaxService(db).list_page(ctx.business_id, customer_id, params)


@router.post(f"/{PATH}", response_model=WithholdingTaxReceiptResponse, status_code=status.HTTP_201_CREATED)
async def create_receipt(
    body: CreateWithholdingTaxReceiptRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> WithholdingTaxReceiptResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, f"POST {PATH}"), body, lambda: WithholdingTaxService(db).create(ctx, body))


@router.get(f"/{PATH}/{{document_id}}", response_model=WithholdingTaxReceiptResponse)
async def get_receipt(
    document_id: str,
    ctx: BusinessContext = Depends(view),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> WithholdingTaxReceiptResponse:
    return await WithholdingTaxService(db).get(ctx.business_id, document_id)


@router.put(f"/{PATH}/{{document_id}}", response_model=WithholdingTaxReceiptResponse)
async def update_receipt(
    document_id: str,
    body: UpdateWithholdingTaxReceiptRequest,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> WithholdingTaxReceiptResponse:
    return await WithholdingTaxService(db).update(ctx, document_id, body)


@router.post(f"/{PATH}/{{document_id}}/post", response_model=WithholdingTaxReceiptResponse)
async def post_receipt(
    document_id: str,
    body: DocumentActionRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> WithholdingTaxReceiptResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, f"POST {PATH}/{document_id}/post"), body,
        lambda: WithholdingTaxService(db).post(ctx, document_id, body.version), status_code=status.HTTP_200_OK)


@router.post(f"/{PATH}/{{document_id}}/void", response_model=WithholdingTaxReceiptResponse)
async def void_receipt(
    document_id: str,
    body: DocumentActionRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> WithholdingTaxReceiptResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, f"POST {PATH}/{document_id}/void"), body,
        lambda: WithholdingTaxService(db).void(ctx, document_id, body.version), status_code=status.HTTP_200_OK)


@router.get("/settings/withholding-tax", response_model=WithholdingTaxSettingsResponse)
async def get_settings(
    ctx: BusinessContext = Depends(require_business_member()),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> WithholdingTaxSettingsResponse:
    """Read by every member: the forms show the WHT fields from these flags."""
    return await WithholdingTaxService(db).get_settings(ctx.business_id)


@router.put("/settings/withholding-tax", response_model=WithholdingTaxSettingsResponse)
async def update_settings(
    body: UpdateWithholdingTaxSettingsRequest,
    ctx: BusinessContext = Depends(require_business_access(SETTINGS_AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> WithholdingTaxSettingsResponse:
    return await WithholdingTaxService(db).update_settings(ctx, body)
