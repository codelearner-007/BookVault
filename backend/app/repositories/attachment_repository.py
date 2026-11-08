"""Attachments repository: metadata, private bytes and the per-business usage (B3)."""

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attachment import Attachment, AttachmentContent

_USED_BYTES = text("SELECT public.business_attachment_bytes(CAST(:business_id AS uuid))")
_DOCUMENT_AREA = text(
    "SELECT d.area_key FROM public.documents d WHERE d.business_id = :business_id AND d.id = :document_id"
)


class AttachmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _live(business_id: str):
        return select(Attachment).where(Attachment.business_id == business_id, Attachment.deleted_at.is_(None))

    async def list_page(self, business_id: str, document_id: str | None, offset: int,
                        limit: int) -> tuple[list[Attachment], int]:
        query = self._live(business_id).where(
            Attachment.document_id == document_id if document_id else Attachment.document_id.is_(None))
        total = (await self.session.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
        rows = await self.session.execute(
            query.order_by(Attachment.created_at.desc(), Attachment.id.desc()).offset(offset).limit(limit))
        return list(rows.scalars().all()), total

    async def get(self, business_id: str, attachment_id: str) -> Attachment | None:
        return (await self.session.execute(
            self._live(business_id).where(Attachment.id == attachment_id))).scalar_one_or_none()

    async def content(self, business_id: str, attachment_id: str) -> bytes | None:
        return (await self.session.execute(select(AttachmentContent.content).where(
            AttachmentContent.business_id == business_id, AttachmentContent.attachment_id == attachment_id,
        ))).scalar_one_or_none()

    async def document_area(self, business_id: str, document_id: str) -> str | None:
        return (await self.session.execute(
            _DOCUMENT_AREA, {"business_id": business_id, "document_id": document_id})).scalar_one_or_none()

    async def used_bytes(self, business_id: str) -> int:
        return int((await self.session.execute(_USED_BYTES, {"business_id": business_id})).scalar() or 0)

    async def add(self, row: Attachment, content: bytes) -> None:
        self.session.add(row)
        await self.session.flush()
        await self.session.refresh(row)
        self.session.add(AttachmentContent(attachment_id=row.id, business_id=row.business_id, content=content))
        await self.session.flush()

    async def save(self) -> None:
        await self.session.flush()
