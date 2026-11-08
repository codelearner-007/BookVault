"""Read-only queries about accounts for business user management (auth.users is Supabase-owned)."""

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

BOOTSTRAP_EMAIL_KEY = "bootstrap_super_admin_email"


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
    FROM auth.users u
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
    JOIN auth.users u ON u.id = p.user_id
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
            text("SELECT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(:email))"),
            {"email": email},
        )
        return bool(result.scalar())

    async def get_bootstrap_email(self) -> str | None:
        result = await self.session.execute(
            text("SELECT text_value FROM public.platform_settings WHERE key = :key"),
            {"key": BOOTSTRAP_EMAIL_KEY},
        )
        return result.scalar_one_or_none()

    async def set_bootstrap_email(self, email: str | None) -> None:
        await self.session.execute(
            text(
                "INSERT INTO public.platform_settings (key, value_type, text_value, updated_at)"
                " VALUES (:key, 'text', :email, now())"
                " ON CONFLICT (key) DO UPDATE SET text_value = EXCLUDED.text_value, updated_at = now()"
            ),
            {"key": BOOTSTRAP_EMAIL_KEY, "email": email},
        )

    async def update_full_name(self, user_id: str, full_name: str) -> None:
        await self.session.execute(
            text("UPDATE public.user_profiles SET full_name = :full_name, updated_at = now()"
                 " WHERE user_id = CAST(:user_id AS uuid)"),
            {"user_id": user_id, "full_name": full_name},
        )

    async def count_active_owned_businesses(self, user_id: str) -> int:
        result = await self.session.execute(
            text("SELECT count(*) FROM public.businesses"
                 " WHERE owner_id = CAST(:user_id AS uuid) AND deleted_at IS NULL"),
            {"user_id": user_id},
        )
        return int(result.scalar_one())
