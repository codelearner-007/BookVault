"""Audit log response schemas."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    scope: str
    business_id: Optional[str]
    user_id: Optional[str]
    action: str
    entity_type: str
    entity_id: Optional[str]
    before: Optional[dict[str, Any]]
    after: Optional[dict[str, Any]]
    details: Optional[dict[str, Any]]
    request_id: Optional[str]
    performed_by: Optional[str] = None
