"""Audit log repository (append-only: insert and read, nothing else)."""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy import distinct, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.user_profile import UserProfile


@dataclass(frozen=True)
class AuditFilter:
    user_id: Optional[str] = None
    business_id: Optional[str] = None
    entity_type: Optional[str] = None
    action: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    scope: Optional[str] = None


def _where(query, f: AuditFilter):
    if f.scope is not None:
        query = query.where(AuditLog.scope == f.scope)
    if f.user_id is not None:
        query = query.where(AuditLog.user_id == f.user_id)
    if f.business_id is not None:
        query = query.where(AuditLog.business_id == f.business_id)
    if f.entity_type is not None:
        query = query.where(AuditLog.entity_type == f.entity_type)
    if f.action is not None:
        query = query.where(AuditLog.action == f.action)
    if f.start_date is not None:
        query = query.where(AuditLog.created_at >= f.start_date)
    if f.end_date is not None:
        query = query.where(AuditLog.created_at <= f.end_date)
    return query


class AuditRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def count(self, f: AuditFilter) -> int:
        result = await self.session.execute(_where(select(func.count()).select_from(AuditLog), f))
        return result.scalar_one()

    async def list_page(
        self, f: AuditFilter, offset: int, limit: int
    ) -> list[tuple[AuditLog, str | None]]:
        query = _where(
            select(AuditLog, UserProfile.full_name).outerjoin(
                UserProfile, UserProfile.user_id == AuditLog.user_id
            ),
            f,
        )
        result = await self.session.execute(
            query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset(offset).limit(limit)
        )
        return [(row[0], row[1]) for row in result.all()]

    async def list_entity_types(self, offset: int, limit: int) -> tuple[list[str], int]:
        total = (
            await self.session.execute(select(func.count(distinct(AuditLog.entity_type))))
        ).scalar_one()
        result = await self.session.execute(
            select(distinct(AuditLog.entity_type))
            .order_by(AuditLog.entity_type)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all()), total

    async def add(self, row: AuditLog) -> None:
        self.session.add(row)
        await self.session.flush()

    async def ingest_gotrue_events(self, batch: int) -> int:
        """Copy new auth.audit_log_entries rows into audit_logs (idempotent, SECURITY DEFINER)."""
        result = await self.session.execute(
            text("SELECT public.ingest_auth_audit_log(:batch)"), {"batch": batch}
        )
        return int(result.scalar_one())
