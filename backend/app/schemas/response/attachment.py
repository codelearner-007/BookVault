"""Attachment responses (metadata only; bytes are served through signed links)."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import PaginatedResponse


class AttachmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str | None
    original_name: str
    mime_type: str
    size_bytes: int
    created_at: datetime


class AttachmentListResponse(PaginatedResponse[AttachmentResponse]):
    pass


class AttachmentUrlResponse(BaseModel):
    url: str
    expires_at: datetime
