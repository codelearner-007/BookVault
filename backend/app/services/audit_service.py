"""Audit logging service."""

from datetime import datetime
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.repositories.audit_repository import AuditRepository
from app.schemas.response.audit import AuditLogResponse
from app.schemas.common import PaginatedResponse


class AuditService:
    """Service for audit logging and querying."""

    def __init__(self, session: AsyncSession):
        self.repository = AuditRepository(session)

    async def list_logs_paginated(
        self,
        page: int = 1,
        page_size: int = 20,
        module: Optional[str] = None,
        action: Optional[str] = None,
        user_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        business_id: Optional[str] = None,
    ) -> PaginatedResponse[AuditLogResponse]:
        total = await self.repository.count_filtered(
            module=module, action=action, user_id=user_id,
            start_date=start_date, end_date=end_date, business_id=business_id,
        )
        offset = (page - 1) * page_size
        total_pages = (total + page_size - 1) // page_size

        rows = await self.repository.list_filtered(
            offset=offset, limit=page_size,
            module=module, action=action, user_id=user_id,
            start_date=start_date, end_date=end_date, business_id=business_id,
        )

        items = []
        for row in rows:
            audit_log, full_name = row[0], row[1]
            items.append(AuditLogResponse(
                id=str(audit_log.id),
                created_at=audit_log.created_at,
                user_id=str(audit_log.user_id) if audit_log.user_id else None,
                action=audit_log.action,
                module=audit_log.module,
                resource_id=audit_log.resource_id,
                details=audit_log.details,
                performed_by=full_name,
            ))

        return PaginatedResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    async def list_distinct_modules(self) -> List[str]:
        return await self.repository.list_distinct_modules()

    async def log_action(
        self,
        user_id: Optional[str],
        action: str,
        module: str,
        resource_id: Optional[str] = None,
        details: Optional[dict] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        return await self.repository.create_log(
            user_id=user_id,
            action=action,
            module=module,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent,
        )
