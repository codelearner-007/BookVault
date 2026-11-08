"""Attachments endpoints (B3, NA-04, AC-26): upload, list, signed link, soft delete, content."""

from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_db, require_business_member, require_idempotency_key
from app.core.exceptions import ResourceNotFoundError
from app.core.files import verify_link
from app.core.pagination import PageParams, page_params
from app.db.session import bind_request_user
from app.schemas.common import IdStr, OptionalName
from app.schemas.response.attachment import AttachmentListResponse, AttachmentResponse, AttachmentUrlResponse
from app.services.access_service import BusinessContext
from app.services.attachment_service import AttachmentService, FileTooLargeError
from app.services.idempotency_service import IdempotencyService, business_scope

router = APIRouter(tags=["Attachments"])
BASE = "/businesses/{business_id}/attachments"
# Rights are checked per document area inside the service (the area comes from the document).
_MEMBER = require_business_member()


async def _read_capped(request: Request, limit: int) -> bytes:
    """The request body, refused as soon as it passes the per-file limit (never buffered beyond)."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise FileTooLargeError()
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise FileTooLargeError()
        chunks.append(chunk)
    return b"".join(chunks)


@router.post(BASE, response_model=AttachmentResponse, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    request: Request,
    document_id: IdStr | None = Query(None),
    name: OptionalName = Query(None),
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(_MEMBER),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> AttachmentResponse:
    """Body = the file bytes (application/octet-stream); `name` is display metadata only."""
    content = await _read_capped(request, settings.ATTACHMENT_MAX_BYTES)
    service = AttachmentService(db)
    file = service.fingerprint(document_id, name, content)
    area = await service.area(ctx.business_id, document_id)
    return await IdempotencyService(db).run(
        business_scope(ctx, key, area, "POST attachments"), file,
        lambda: service.upload(ctx, file, content),
    )


@router.get(BASE, response_model=AttachmentListResponse)
async def list_attachments(
    document_id: IdStr | None = Query(None),
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(_MEMBER),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> AttachmentListResponse:
    return await AttachmentService(db).list_page(ctx, document_id, params)


@router.get(BASE + "/{attachment_id}/url", response_model=AttachmentUrlResponse)
async def attachment_url(
    attachment_id: str,
    ctx: BusinessContext = Depends(_MEMBER),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> AttachmentUrlResponse:
    """A short-lived signed link for this member (view right on the document's area)."""
    return await AttachmentService(db).signed_url(ctx, attachment_id)


@router.delete(BASE + "/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    attachment_id: str,
    ctx: BusinessContext = Depends(_MEMBER),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> None:
    await AttachmentService(db).delete(ctx, attachment_id)


@router.get("/attachments/content", response_class=Response)
async def attachment_content(
    token: str = Query(..., max_length=2048),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> Response:
    """Serve the bytes of a signed link; RLS runs as the member the link was issued to."""
    claims = verify_link(token)
    if claims is None:
        raise ResourceNotFoundError("Attachment", "link")
    bind_request_user(db, claims["u"])  # before the first query: the transaction starts as that member
    row, data = await AttachmentService(db).content(claims["b"], claims["a"])
    return Response(content=data, media_type=row.mime_type, headers={
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(row.original_name)}",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
    })
