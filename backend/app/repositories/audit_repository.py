"""Audit log repository."""

from datetime import datetime
from typing import List, Optional

from sqlalchemy import func, or_, select, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.user_profile import UserProfile
from app.repositories.base_repository import BaseRepository


class AuditRepository(BaseRepository[AuditLog]):
    """Repository for AuditLog model."""

    def __init__(self, session: AsyncSession):
        super().__init__(AuditLog, session)

    def _apply_filters(
        self,
        query,
        module: Optional[str] = None,
        action: Optional[str] = None,
        user_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        business_id: Optional[str] = None,
    ):
        if module:
            query = query.where(AuditLog.module == module)
        if action:
            query = query.where(AuditLog.action == action)
        if user_id:
            query = query.where(AuditLog.user_id == user_id)
        if start_date:
            query = query.where(AuditLog.created_at >= start_date)
        if end_date:
            query = query.where(AuditLog.created_at <= end_date)
        if business_id:
            query = query.where(
                or_(
                    AuditLog.resource_id == business_id,
                    AuditLog.details["business_id"].as_string() == business_id,
                )
            )
        return query

    async def count_filtered(
        self,
        module: Optional[str] = None,
        action: Optional[str] = None,
        user_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        business_id: Optional[str] = None,
    ) -> int:
        query = self._apply_filters(
            select(func.count()).select_from(AuditLog),
            module, action, user_id, start_date, end_date, business_id,
        )
        result = await self.session.execute(query)
        return result.scalar() or 0

    async def list_filtered(
        self,
        offset: int = 0,
        limit: int = 20,
        module: Optional[str] = None,
        action: Optional[str] = None,
        user_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        business_id: Optional[str] = None,
    ) -> List[tuple]:
        query = self._apply_filters(
            select(AuditLog, UserProfile.full_name).outerjoin(
                UserProfile, UserProfile.user_id == AuditLog.user_id
            ),
            module, action, user_id, start_date, end_date, business_id,
        )
        query = query.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
        result = await self.session.execute(query)
        return list(result.all())

    async def list_distinct_modules(self) -> List[str]:
        query = select(distinct(AuditLog.module)).order_by(AuditLog.module)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def count_since(self, since: datetime) -> int:
        query = select(func.count()).select_from(AuditLog).where(
            AuditLog.created_at >= since
        )
        result = await self.session.execute(query)
        return result.scalar() or 0

    async def create_log(
        self,
        user_id: Optional[str],
        action: str,
        module: str,
        resource_id: Optional[str] = None,
        details: Optional[dict] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        audit_log = AuditLog(
            user_id=user_id,
            action=action,
            module=module,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return await self.create(audit_log)
