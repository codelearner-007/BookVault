"""Dashboard statistics service: the caller's own businesses and actions."""

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.audit_repository import AuditFilter, AuditRepository
from app.repositories.member_repository import MemberRepository
from app.schemas.response.dashboard import DashboardStatsResponse

RECENT_ACTIVITY_WINDOW = timedelta(days=1)


class DashboardService:
    def __init__(self, session: AsyncSession):
        self.members = MemberRepository(session)
        self.audit = AuditRepository(session)

    async def get_stats(self, user_id: str) -> DashboardStatsResponse:
        since = datetime.now(timezone.utc) - RECENT_ACTIVITY_WINDOW
        return DashboardStatsResponse(
            total_businesses=await self.members.count_user_businesses(user_id),
            total_audit_logs=await self.audit.count(AuditFilter(user_id=user_id)),
            recent_activity_24h=await self.audit.count(AuditFilter(user_id=user_id, start_date=since)),
        )
