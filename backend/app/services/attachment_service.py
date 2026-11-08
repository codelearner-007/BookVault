"""Attachments of documents (B3, NA-04, AC-26).

Upload: right `create` on the document's area (folder-only files: folders_attachments), size
limit and per-business quota from config, type from magic bytes, server-generated id, the
client's name kept as display metadata only. Download: a short-lived HMAC-signed link issued
to a member with `view`; the link is served in a session bound to that member, so RLS re-checks
the membership and the right at download time. Delete = soft (audited).
"""

import hashlib
from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.config import settings
from app.core.exceptions import AppException, ConflictError, ResourceNotFoundError
from app.core.files import detect_mime_type, safe_file_name, sign_link
from app.core.ids import is_uuid
from app.core.pagination import PageParams
from app.models.attachment import Attachment
from app.repositories.attachment_repository import AttachmentRepository
from app.schemas.response.attachment import AttachmentListResponse, AttachmentResponse, AttachmentUrlResponse
from app.services.access_service import AccessService, BusinessContext
from app.services.audit_service import AuditService

ENTITY = "Attachment"
FOLDER_AREA = "folders_attachments"
CONTENT_PATH = "/api/v1/attachments/content"


class UploadFingerprint(BaseModel):
    """What the Idempotency-Key is bound to (the same key with another file -> 409)."""

    document_id: str | None
    name: str
    sha256: str
    size_bytes: int


class FileTooLargeError(AppException):
    def __init__(self) -> None:
        super().__init__("The file is too large", 413, {"code": "file_too_large"})


class FileTypeNotAllowedError(AppException):
    def __init__(self) -> None:
        super().__init__("File type not allowed. Accepted: JPEG, PNG, WebP, GIF, PDF", 415,
                         {"code": "file_type_not_allowed"})


class AttachmentService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = AttachmentRepository(session)
        self.access = AccessService(session)
        self.audit = AuditService(session)

    async def area(self, business_id: str, document_id: str | None) -> str:
        if document_id is None:
            return FOLDER_AREA
        area = await self.repo.document_area(business_id, document_id) if is_uuid(document_id) else None
        if area is None:
            raise ResourceNotFoundError("Document", document_id)
        return area

    async def _require(self, ctx: BusinessContext, document_id: str | None, right: AreaRight) -> None:
        area = await self.area(ctx.business_id, document_id)
        await self.access.resolve(ctx.business_id, ctx.user_id, area, right, aal=ctx.aal)

    async def _get_or_404(self, ctx: BusinessContext, attachment_id: str) -> Attachment:
        row = await self.repo.get(ctx.business_id, attachment_id) if is_uuid(attachment_id) else None
        if row is None:
            raise ResourceNotFoundError(ENTITY, attachment_id)
        return row

    # ---------------------------------------------------------------- upload
    @staticmethod
    def fingerprint(document_id: str | None, name: str | None, content: bytes) -> UploadFingerprint:
        if len(content) > settings.ATTACHMENT_MAX_BYTES:
            raise FileTooLargeError()
        return UploadFingerprint(document_id=document_id, name=safe_file_name(name),
                                 sha256=hashlib.sha256(content).hexdigest(), size_bytes=len(content))

    async def upload(self, ctx: BusinessContext, file: UploadFingerprint, content: bytes) -> AttachmentResponse:
        await self._require(ctx, file.document_id, AreaRight.CREATE)
        mime = detect_mime_type(content)
        if mime is None or not content:
            raise FileTypeNotAllowedError()
        if await self.repo.used_bytes(ctx.business_id) + file.size_bytes > settings.ATTACHMENT_QUOTA_BYTES:
            raise ConflictError("The storage quota of this business is used up", "storage_quota_exceeded")
        row = Attachment(business_id=ctx.business_id, document_id=file.document_id, original_name=file.name,
                         mime_type=mime, size_bytes=file.size_bytes, sha256=file.sha256, uploaded_by=ctx.user_id)
        await self.repo.add(row, content)
        after = AttachmentResponse.model_validate(row)
        await self.audit.record(ctx.user_id, "create", ENTITY, row.id, ctx.business_id, after=after)
        return after

    # ---------------------------------------------------------------- reads
    async def list_page(self, ctx: BusinessContext, document_id: str | None,
                        params: PageParams) -> AttachmentListResponse:
        await self._require(ctx, document_id, AreaRight.VIEW)
        rows, total = await self.repo.list_page(ctx.business_id, document_id, params.offset, params.page_size)
        return AttachmentListResponse.build([AttachmentResponse.model_validate(r) for r in rows],
                                            total, params.page, params.page_size)

    async def signed_url(self, ctx: BusinessContext, attachment_id: str) -> AttachmentUrlResponse:
        row = await self._get_or_404(ctx, attachment_id)
        await self._require(ctx, row.document_id, AreaRight.VIEW)
        token, expires = sign_link({"a": row.id, "b": row.business_id, "u": ctx.user_id},
                                   settings.ATTACHMENT_URL_TTL_SECONDS)
        return AttachmentUrlResponse(url=f"{CONTENT_PATH}?token={token}",
                                     expires_at=datetime.fromtimestamp(expires, timezone.utc))

    async def content(self, business_id: str, attachment_id: str) -> tuple[Attachment, bytes]:
        """Read in a session bound to the link's member: RLS decides (membership + view, live)."""
        row = await self.repo.get(business_id, attachment_id)
        data = await self.repo.content(business_id, attachment_id) if row else None
        if row is None or data is None:
            raise ResourceNotFoundError(ENTITY, attachment_id)
        return row, data

    # ---------------------------------------------------------------- delete
    async def delete(self, ctx: BusinessContext, attachment_id: str) -> None:
        row = await self._get_or_404(ctx, attachment_id)
        await self._require(ctx, row.document_id, AreaRight.DELETE)
        before = AttachmentResponse.model_validate(row)
        row.deleted_at = datetime.now(timezone.utc)
        row.deleted_by = ctx.user_id
        await self.repo.save()
        await self.audit.record(ctx.user_id, "delete", ENTITY, row.id, ctx.business_id, before=before)
