"""Inter account transfers endpoints (B3, PR-10)."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access, require_idempotency_key
from app.core.pagination import PageParams, page_params
from app.schemas.request.journal_entry import DocumentActionRequest
from app.schemas.request.transfer import CreateTransferRequest, UpdateTransferRequest
from app.schemas.response.transfer import TransferListResponse, TransferResponse
from app.services.access_service import BusinessContext
from app.services.idempotency_service import IdempotencyService, business_scope
from app.services.transfer_service import AREA, TransferService

router = APIRouter(prefix="/businesses/{business_id}/inter-account-transfers", tags=["Inter Account Transfers"])
_VIEW = require_business_access(AREA, AreaRight.VIEW)


@router.get("", response_model=TransferListResponse)
async def list_transfers(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(_VIEW),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TransferListResponse:
    return await TransferService(db).list_page(ctx.business_id, params)


@router.post("", response_model=TransferResponse, status_code=status.HTTP_201_CREATED)
async def create_transfer(
    body: CreateTransferRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TransferResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, "POST inter-account-transfers"), body,
        lambda: TransferService(db).create(ctx, body),
    )


@router.get("/{document_id}", response_model=TransferResponse)
async def get_transfer(
    document_id: str,
    ctx: BusinessContext = Depends(_VIEW),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TransferResponse:
    return await TransferService(db).get(ctx.business_id, document_id)


@router.put("/{document_id}", response_model=TransferResponse)
async def update_transfer(
    document_id: str,
    body: UpdateTransferRequest,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TransferResponse:
    return await TransferService(db).update(ctx, document_id, body)


@router.post("/{document_id}/post", response_model=TransferResponse)
async def post_transfer(
    document_id: str,
    body: DocumentActionRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TransferResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, f"POST inter-account-transfers/{document_id}/post"), body,
        lambda: TransferService(db).post(ctx, document_id, body.version), status_code=status.HTTP_200_OK,
    )


@router.post("/{document_id}/void", response_model=TransferResponse)
async def void_transfer(
    document_id: str,
    body: DocumentActionRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TransferResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, f"POST inter-account-transfers/{document_id}/void"), body,
        lambda: TransferService(db).void(ctx, document_id, body.version), status_code=status.HTTP_200_OK,
    )
