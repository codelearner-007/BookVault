"""Audit trail: one append-only row per mutation, in the same transaction (B0.5, AC-24)."""

from typing import Any, Optional

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams
from app.core.request_context import current_request_id
from app.models.audit_log import SCOPE_BUSINESS, SCOPE_PLATFORM, AuditLog
from app.repositories.audit_repository import AuditFilter, AuditRepository
from app.schemas.common import PaginatedResponse
from app.schemas.response.audit import AuditLogResponse

Snapshot = BaseModel | dict[str, Any] | None


def _snapshot(value: Snapshot) -> dict[str, Any] | None:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    return value


class AuditService:
    def __init__(self, session: AsyncSession) -> None:
        self.repository = AuditRepository(session)

    async def record(
        self,
        actor_id: Optional[str],
        action: str,
        entity_type: str,
        entity_id: Optional[str] = None,
        business_id: Optional[str] = None,
        before: Snapshot = None,
        after: Snapshot = None,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        """Write one audit row; business-scoped whenever a business id is given."""
        await self.repository.add(AuditLog(
            scope=SCOPE_BUSINESS if business_id else SCOPE_PLATFORM,
            business_id=business_id,
            user_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else None,
            before=_snapshot(before),
            after=_snapshot(after),
            details=details,
            request_id=current_request_id(),
        ))

    async def list_page(
        self, f: AuditFilter, params: PageParams
    ) -> PaginatedResponse[AuditLogResponse]:
        total = await self.repository.count(f)
        rows = await self.repository.list_page(f, params.offset, params.page_size)
        items = [
            AuditLogResponse.model_validate(row).model_copy(update={"performed_by": full_name})
            for row, full_name in rows
        ]
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def list_entity_types(self, params: PageParams) -> PaginatedResponse[str]:
        items, total = await self.repository.list_entity_types(params.offset, params.page_size)
        return PaginatedResponse.build(items, total, params.page, params.page_size)
