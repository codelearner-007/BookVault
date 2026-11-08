"""Workspace dashboard reads: my businesses with their ledger figures, and recent activity.

A fixed number of queries per request, whatever the page size (no N+1): the business page, its
count, one batched figures aggregate (SECURITY DEFINER, rights checked per figure) and one activity
query. Every query is scoped to businesses the caller is an active member of, so other tenants'
rows never appear, even for a super admin whose RLS reach is wider on audit_logs.
"""

from datetime import date

from sqlalchemy import text
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

# Businesses I am an active member of (owners have a member row too), live ones only.
_MY_BUSINESSES_FROM = """
    FROM public.businesses b
    JOIN public.business_members bm ON bm.business_id = b.id AND bm.user_id = CAST(:user_id AS uuid)
    JOIN public.member_statuses ms ON ms.id = bm.status_id AND ms.key = 'active'
"""
_MY_BUSINESSES_WHERE = """
    WHERE b.deleted_at IS NULL
      AND (CAST(:pattern AS text) IS NULL OR b.name ILIKE CAST(:pattern AS text) ESCAPE '\\')
"""

# An audit row I may read in a business: my own action, or any with the History view right.
_VISIBLE_AUDIT = "(a.user_id = CAST(:user_id AS uuid) OR public.has_area_access(a.business_id, 'history', 'view'))"

_BUSINESS_PAGE = text(f"""
    SELECT CAST(b.id AS text) AS id, b.name, c.name AS country, cur.code AS currency_code,
           cur.decimal_places, f.number_format, (b.owner_id = CAST(:user_id AS uuid)) AS is_owner,
           CASE WHEN b.owner_id = CAST(:user_id AS uuid) THEN (
               SELECT count(*) FROM public.business_members m
               JOIN public.member_statuses s ON s.id = m.status_id AND s.key = 'active'
               WHERE m.business_id = b.id) END AS member_count,
           (SELECT max(a.created_at) FROM public.audit_logs a
            WHERE a.scope = 'business' AND a.business_id = b.id AND {_VISIBLE_AUDIT}) AS last_activity_at
    {_MY_BUSINESSES_FROM}
    LEFT JOIN public.countries c ON c.id = b.country_id
    LEFT JOIN public.business_currencies bc ON bc.business_id = b.id AND bc.is_base
    LEFT JOIN public.currencies cur ON cur.id = bc.currency_id
    LEFT JOIN public.business_format f ON f.business_id = b.id
    {_MY_BUSINESSES_WHERE}
    ORDER BY b.name, b.id
    OFFSET :offset LIMIT :limit
""")

_BUSINESS_COUNT = text(f"SELECT count(*) {_MY_BUSINESSES_FROM} {_MY_BUSINESSES_WHERE}")

_FIGURES = text("""
    SELECT CAST(business_id AS text) AS business_id, cash, receivables, payables, net_profit, suspense,
           overdue_count, overdue_amount
    FROM public.dashboard_business_figures(CAST(:ids AS uuid[]), :date_from, :date_to)
""")

_RECENT_ACTIVITY = text(f"""
    SELECT CAST(a.id AS text) AS id, CAST(a.business_id AS text) AS business_id, b.name AS business_name,
           a.action, a.entity_type, a.entity_id,
           COALESCE(a.after ->> 'name', a.before ->> 'name',
                    a.after ->> 'reference', a.before ->> 'reference') AS record_label,
           (a.user_id = CAST(:user_id AS uuid)) AS is_mine, p.full_name AS performed_by, a.created_at
    FROM public.audit_logs a
    JOIN public.businesses b ON b.id = a.business_id AND b.deleted_at IS NULL
    JOIN public.business_members bm ON bm.business_id = b.id AND bm.user_id = CAST(:user_id AS uuid)
    JOIN public.member_statuses ms ON ms.id = bm.status_id AND ms.key = 'active'
    LEFT JOIN public.user_profiles p ON p.user_id = a.user_id
    WHERE a.scope = 'business' AND {_VISIBLE_AUDIT}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT :limit
""")


def _like_pattern(search: str | None) -> str | None:
    """`%term%` with LIKE wildcards in the term escaped; None = no filter."""
    if not search:
        return None
    escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


class DashboardRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def business_page(
        self, user_id: str, search: str | None, offset: int, limit: int
    ) -> tuple[list[Row], int]:
        args = {"user_id": user_id, "pattern": _like_pattern(search)}
        total = (await self.session.execute(_BUSINESS_COUNT, args)).scalar_one()
        rows = (await self.session.execute(_BUSINESS_PAGE, {**args, "offset": offset, "limit": limit})).all()
        return list(rows), total

    async def figures(self, business_ids: list[str], date_from: date, date_to: date) -> dict[str, Row]:
        if not business_ids:
            return {}
        result = await self.session.execute(
            _FIGURES, {"ids": business_ids, "date_from": date_from, "date_to": date_to}
        )
        return {row.business_id: row for row in result.all()}

    async def recent_activity(self, user_id: str, limit: int) -> list[Row]:
        result = await self.session.execute(_RECENT_ACTIVITY, {"user_id": user_id, "limit": limit})
        return list(result.all())
