"""Read-only queries about accounts for business user management (auth.users via private.accounts)."""

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

@dataclass(frozen=True)
class AccountRow:
    user_id: str
    email: str | None
    full_name: str | None
    role: str | None
    is_provisioned: bool
    created_by_user_id: str | None
    banned: bool


_ACCOUNT_SQL = text(
    """
    SELECT u.id::text, u.email, p.full_name,
           (SELECT r.name FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
            WHERE ur.user_id = u.id ORDER BY r.hierarchy_level DESC LIMIT 1),
           COALESCE(p.is_provisioned, false), p.created_by_user_id::text,
           COALESCE(u.banned_until > now(), false)
    FROM private.accounts u
    LEFT JOIN public.user_profiles p ON p.user_id = u.id
    WHERE u.id = CAST(:user_id AS uuid)
    """
)

_CREATED_BY_SQL = text(
    """
    SELECT u.id::text, u.email, p.full_name,
           (SELECT r.name FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
            WHERE ur.user_id = u.id ORDER BY r.hierarchy_level DESC LIMIT 1),
           p.is_provisioned, p.created_by_user_id::text, COALESCE(u.banned_until > now(), false)
    FROM public.user_profiles p
    JOIN private.accounts u ON u.id = p.user_id
    WHERE p.created_by_user_id = CAST(:creator_id AS uuid)
    ORDER BY u.created_at
    LIMIT :limit OFFSET :offset
    """
)


class ManagedUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_account(self, user_id: str) -> AccountRow | None:
        row = (await self.session.execute(_ACCOUNT_SQL, {"user_id": user_id})).first()
        return AccountRow(*row) if row else None

    async def list_created_by(self, creator_id: str, limit: int, offset: int) -> list[AccountRow]:
        rows = await self.session.execute(
            _CREATED_BY_SQL, {"creator_id": creator_id, "limit": limit, "offset": offset}
        )
        return [AccountRow(*row) for row in rows.all()]

    async def count_created_by(self, creator_id: str) -> int:
        result = await self.session.execute(
            text("SELECT count(*) FROM public.user_profiles"
                 " WHERE created_by_user_id = CAST(:creator_id AS uuid)"),
            {"creator_id": creator_id},
        )
        return int(result.scalar_one())

    async def email_has_account(self, email: str) -> bool:
        result = await self.session.execute(
            text("SELECT public.email_has_account(:email)"),
            {"email": email},
        )
        return bool(result.scalar())

    async def is_bootstrap_email(self, email: str) -> bool:
        # platform_settings is reachable only through SECURITY DEFINER functions (B0.4).
        result = await self.session.execute(
            text("SELECT public.is_bootstrap_super_admin_email(:email)"), {"email": email}
        )
        return bool(result.scalar())

    async def set_bootstrap_email(self, email: str | None) -> None:
        await self.session.execute(
            text("SELECT public.set_bootstrap_super_admin_email(:email)"), {"email": email}
        )

    async def update_full_name(self, user_id: str, full_name: str) -> None:
        await self.session.execute(
            text("UPDATE public.user_profiles SET full_name = :full_name, updated_at = now()"
                 " WHERE user_id = CAST(:user_id AS uuid)"),
            {"user_id": user_id, "full_name": full_name},
        )

    async def count_active_owned_businesses(self, user_id: str) -> int:
        # SECURITY DEFINER: the super admin sees the count, never the businesses (D-14).
        result = await self.session.execute(
            text("SELECT public.count_owned_businesses(CAST(:user_id AS uuid), false)"),
            {"user_id": user_id},
        )
        return int(result.scalar() or 0)
