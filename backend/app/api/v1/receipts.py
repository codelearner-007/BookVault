"""Receipts endpoints."""

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_idempotency_key
from app.core.pagination import PageParams, page_params
from app.schemas.common import PaginatedResponse
from app.schemas.request.receipt import ReceiptCreate, ReceiptUpdate
from app.schemas.response.receipt import ReceiptResponse
from app.services.access_service import BusinessContext
from app.services.idempotency_service import IdempotencyService, business_scope
from app.services.receipt_service import ReceiptService

AREA = "receipts"

router = APIRouter(prefix="/businesses/{business_id}/receipts", tags=["Receipts"])


@router.get("", response_model=PaginatedResponse[ReceiptResponse])
async def list_receipts(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[ReceiptResponse]:
    return await ReceiptService(db).list_page(ctx.business_id, params)


@router.get(
    "/upload-authorization",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_business_access(AREA, AreaRight.CREATE))],
)
async def authorize_receipt_upload() -> Response:
    """Asked by the Next.js upload route (B0.2 stop-gap): may the caller attach files here?"""
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("", response_model=ReceiptResponse, status_code=status.HTTP_201_CREATED)
async def create_receipt(
    body: ReceiptCreate,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db),
) -> ReceiptResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, "POST receipts"),
        body,
        lambda: ReceiptService(db).create(ctx, body),
    )


@router.get("/{receipt_id}", response_model=ReceiptResponse)
async def get_receipt(
    receipt_id: str,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db),
) -> ReceiptResponse:
    return await ReceiptService(db).get(ctx.business_id, receipt_id)


@router.put("/{receipt_id}", response_model=ReceiptResponse)
async def update_receipt(
    receipt_id: str,
    body: ReceiptUpdate,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db),
) -> ReceiptResponse:
    return await ReceiptService(db).update(ctx, receipt_id, body)


@router.delete("/{receipt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_receipt(
    receipt_id: str,
    version: int = Query(..., ge=1),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ReceiptService(db).delete(ctx, receipt_id, version)
