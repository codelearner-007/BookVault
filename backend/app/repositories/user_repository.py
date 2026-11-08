"""User repository: account queries through private.accounts (filtered view of auth.users)."""

from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


SCOPE_ADMINS = "admins"
# Admin Panel list: platform admins, plus self-registered accounts demoted to member (so the
# super admin can switch them back). Never the super admin, never provisioned business members
# (those belong to the admin who created them and live on that business's Members page).
ADMINS_SCOPE_SQL = """
    NOT EXISTS (
        SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = u.id AND r.name = 'super_admin'
    )
    AND (
        EXISTS (
            SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = u.id AND r.name = 'admin'
        )
        OR NOT EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = u.id AND p.is_provisioned)
    )
"""


class UserRepository:
    """Repository for auth.users table (read-only via raw SQL)."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def my_account_state(self) -> tuple[bool, bool] | None:
        """(is_banned, has_verified_factor) of the caller, read live; None if no account."""
        row = (
            await self.session.execute(
                text("SELECT is_banned, has_verified_factor FROM public.my_account_state()")
            )
        ).first()
        return (bool(row[0]), bool(row[1])) if row else None

    async def get_stats(self) -> Dict[str, int]:
        result = await self.session.execute(
            text("""
                SELECT
                    COUNT(*) as total_users,
                    COUNT(*) FILTER (WHERE banned_until IS NULL OR banned_until < NOW()) as active_users,
                    COUNT(*) FILTER (WHERE banned_until > NOW()) as banned_users,
                    COUNT(*) FILTER (WHERE email_confirmed_at IS NOT NULL) as verified_users,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_users_30d
                FROM private.accounts
            """)
        )
        row = result.one()
        return {
            "total_users": row.total_users or 0,
            "active_users": row.active_users or 0,
            "banned_users": row.banned_users or 0,
            "verified_users": row.verified_users or 0,
            "new_users_30d": row.new_users_30d or 0,
        }

    async def count_filtered(
        self,
        role: Optional[str] = None,
        email_verified: Optional[bool] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        scope: Optional[str] = None,
    ) -> int:
        where_clause, params = self._build_where(role, email_verified, status, search, scope)
        query = text(f"SELECT COUNT(DISTINCT u.id) FROM private.accounts u {where_clause}")
        result = await self.session.execute(query.bindparams(**params))
        return result.scalar() or 0

    async def list_filtered(
        self,
        offset: int = 0,
        limit: int = 20,
        role: Optional[str] = None,
        email_verified: Optional[bool] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        scope: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        where_clause, params = self._build_where(role, email_verified, status, search, scope)
        query = text(f"""
            SELECT DISTINCT
                u.id,
                u.email,
                u.created_at,
                u.updated_at,
                u.last_sign_in_at,
                u.email_confirmed_at,
                u.banned_until,
                (SELECT p.full_name FROM user_profiles p WHERE p.user_id = u.id) AS full_name,
                public.count_owned_businesses(u.id, false) AS businesses_owned
            FROM private.accounts u
            {where_clause}
            ORDER BY u.created_at DESC
            LIMIT :limit OFFSET :offset
        """)
        result = await self.session.execute(
            query.bindparams(limit=limit, offset=offset, **params)
        )
        return [
            {
                "id": str(row.id),
                "email": row.email,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
                "last_sign_in_at": row.last_sign_in_at,
                "email_confirmed_at": row.email_confirmed_at,
                "banned_until": row.banned_until,
                "full_name": row.full_name,
                "businesses_owned": row.businesses_owned or 0,
            }
            for row in result
        ]

    def _build_where(
        self,
        role: Optional[str],
        email_verified: Optional[bool],
        status: Optional[str],
        search: Optional[str],
        scope: Optional[str] = None,
    ) -> tuple[str, Dict[str, Any]]:
        conditions: List[str] = []
        params: Dict[str, Any] = {}

        if email_verified is not None:
            if email_verified:
                conditions.append("u.email_confirmed_at IS NOT NULL")
            else:
                conditions.append("u.email_confirmed_at IS NULL")

        if status == "active":
            conditions.append("(u.banned_until IS NULL OR u.banned_until < NOW())")
        elif status == "banned":
            conditions.append("u.banned_until > NOW()")

        if search:
            conditions.append("u.email ILIKE :search")
            params["search"] = f"%{search}%"

        if role:
            conditions.append("""
                EXISTS (
                    SELECT 1 FROM user_roles ur
                    JOIN roles r ON ur.role_id = r.id
                    WHERE ur.user_id = u.id AND r.name = :role
                )
            """)
            params["role"] = role

        if scope == SCOPE_ADMINS:
            conditions.append(ADMINS_SCOPE_SQL)

        where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
        return where_clause, params
