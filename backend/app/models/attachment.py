"""Attachments of documents (B3, NA-04): metadata + private bytes, served via signed links."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, LargeBinary, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()"))
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    document_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    original_name: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_by: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)


class AttachmentContent(Base):
    __tablename__ = "attachment_contents"

    attachment_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
