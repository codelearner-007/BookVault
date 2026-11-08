"""Dashboard service: the caller's own numbers, businesses with ledger figures, recent activity."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.money import DEFAULT_CURRENCY_DECIMALS, round_money
from app.core.pagination import PageParams
from app.repositories.audit_repository import AuditFilter, AuditRepository
from app.repositories.dashboard_repository import DashboardRepository
from app.repositories.member_repository import MemberRepository
from app.schemas.response.dashboard import (
    BusinessFigures,
    DashboardActivity,
    DashboardBusiness,
    DashboardStatsResponse,
    WorkspaceDashboardResponse,
)

RECENT_ACTIVITY_WINDOW = timedelta(days=1)
RECENT_ACTIVITY_LIMIT = 8
FIGURE_FIELDS = ("cash", "receivables", "payables", "net_profit", "suspense")
NO_FIGURES = BusinessFigures(cash_and_bank=None, receivables=None, payables=None, net_profit=None, suspense=None)


def _rounded(value: Decimal | None, decimals: int) -> Decimal | None:
    return None if value is None else round_money(Decimal(value), decimals)


def _figures(row, decimals: int) -> BusinessFigures:
    """Rounded to the currency's minor unit; a business with no row (not a member) gets none."""
    if row is None:
        return NO_FIGURES
    cash, receivables, payables, net_profit, suspense = (_rounded(getattr(row, f), decimals) for f in FIGURE_FIELDS)
    return BusinessFigures(cash_and_bank=cash, receivables=receivables, payables=payables,
                           net_profit=net_profit, suspense=suspense)


class DashboardService:
    def __init__(self, session: AsyncSession):
        self.members = MemberRepository(session)
        self.audit = AuditRepository(session)
        self.repo = DashboardRepository(session)

    async def get_stats(self, user_id: str) -> DashboardStatsResponse:
        since = datetime.now(timezone.utc) - RECENT_ACTIVITY_WINDOW
        return DashboardStatsResponse(
            total_businesses=await self.members.count_user_businesses(user_id),
            total_audit_logs=await self.audit.count(AuditFilter(user_id=user_id)),
            recent_activity_24h=await self.audit.count(AuditFilter(user_id=user_id, start_date=since)),
        )

    async def workspace(
        self, user_id: str, params: PageParams, search: str | None, as_at: date
    ) -> WorkspaceDashboardResponse:
        """As at `as_at`; net profit over 1 January .. as_at (the Summary tab's default period)."""
        period_from = as_at.replace(month=1, day=1)
        rows, total = await self.repo.business_page(user_id, search, params.offset, params.page_size)
        figures = await self.repo.figures([r.id for r in rows], period_from, as_at)
        items = []
        for row in rows:
            decimals = row.decimal_places if row.decimal_places is not None else DEFAULT_CURRENCY_DECIMALS
            items.append(DashboardBusiness(
                id=row.id, name=row.name, country=row.country, currency_code=row.currency_code,
                decimal_places=decimals, number_format=row.number_format, is_owner=row.is_owner,
                member_count=row.member_count, last_activity_at=row.last_activity_at,
                figures=_figures(figures.get(row.id), decimals),
            ))
        activity = [
            DashboardActivity(**row._mapping)
            for row in await self.repo.recent_activity(user_id, RECENT_ACTIVITY_LIMIT)
        ]
        return WorkspaceDashboardResponse.build(
            items, total, params.page, params.page_size,
            as_at=as_at, period_from=period_from, activity=activity,
        )
