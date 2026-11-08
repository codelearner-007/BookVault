"""Receipts endpoints."""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_current_user, get_db, require_business_access
from app.schemas.auth import CurrentUser
from app.schemas.request.receipt import ReceiptCreate, ReceiptUpdate
from app.schemas.response.receipt import ReceiptListResponse, ReceiptResponse
from app.services.audit_service import AuditService
from app.services.receipt_service import ReceiptService

router = APIRouter(
    prefix="/businesses/{business_id}/receipts",
    tags=["Receipts"],
)



@router.get("", response_model=ReceiptListResponse, dependencies=[Depends(require_business_access("receipts", AreaRight.VIEW))])
async def list_receipts(
    business_id: str,
    db: AsyncSession = Depends(get_db),
) -> ReceiptListResponse:
    return await ReceiptService(db).list_receipts(business_id)


@router.get(
    "/upload-authorization",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_business_access("receipts", AreaRight.CREATE))],
)
async def authorize_receipt_upload() -> Response:
    """Asked by the Next.js upload route (B0.2 stop-gap): may the caller attach files here?"""
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("", response_model=ReceiptResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_business_access("receipts", AreaRight.CREATE))])
async def create_receipt(
    business_id: str,
    body: ReceiptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ReceiptResponse:
    fields = body.model_dump()
    # Serialize line items to plain dicts for JSONB storage
    fields["lines"] = [line.model_dump() for line in body.lines]
    result = await ReceiptService(db).create_receipt(business_id=business_id, **fields)
    await AuditService(db).log_action(
        user_id=current_user.user_id,
        action="Create",
        module="Receipt",
        resource_id=str(result.id),
        details={"business_id": business_id},
    )
    return result


@router.get("/{receipt_id}", response_model=ReceiptResponse, dependencies=[Depends(require_business_access("receipts", AreaRight.VIEW))])
async def get_receipt(
    business_id: str,
    receipt_id: str,
    db: AsyncSession = Depends(get_db),
) -> ReceiptResponse:
    return await ReceiptService(db).get_receipt(business_id, receipt_id)


@router.put("/{receipt_id}", response_model=ReceiptResponse, dependencies=[Depends(require_business_access("receipts", AreaRight.EDIT))])
async def update_receipt(
    business_id: str,
    receipt_id: str,
    body: ReceiptUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ReceiptResponse:
    fields = {k: v for k, v in body.model_dump().items() if k in body.model_fields_set}
    # Serialize line items to plain dicts for JSONB storage if lines were provided
    if "lines" in fields and fields["lines"] is not None:
        fields["lines"] = [line.model_dump() for line in body.lines]
    result = await ReceiptService(db).update_receipt(
        business_id=business_id,
        receipt_id=receipt_id,
        fields=fields,
    )
    await AuditService(db).log_action(
        user_id=current_user.user_id,
        action="Update",
        module="Receipt",
        resource_id=str(result.id),
        details={"business_id": business_id},
    )
    return result


@router.delete("/{receipt_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_business_access("receipts", AreaRight.DELETE))])
async def delete_receipt(
    business_id: str,
    receipt_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    await ReceiptService(db).delete_receipt(business_id, receipt_id)
    await AuditService(db).log_action(
        user_id=current_user.user_id,
        action="Delete",
        module="Receipt",
        resource_id=receipt_id,
        details={"business_id": business_id},
    )
