"""Business user management (D-30, D-31 replaced, D-34).

auth.users is written by the Next.js admin routes (Supabase admin API). FastAPI decides
who may do what: a creator manages only the `member` accounts they created; refused
emails all get the same generic answer; every decision is rate-limited per creator.
"""

import hashlib

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppException, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.rate_limit import enforce_user_limit
from app.repositories.managed_user_repository import AccountRow, ManagedUserRepository
from app.schemas.request.member import ManagedUserActionRequest
from app.schemas.response.member import ManagedUserListResponse, ManagedUserResponse

MEMBER_ROLE = "member"
EMAIL_REFUSED_MESSAGE = "This email can't be used, choose another"
REFUSAL_SCOPE = "user_create_refused"
MANAGEMENT_SCOPE = "user_management"


class EmailRefusedError(AppException):
    """Same body for an existing, bootstrap or blocked email: nothing says which case applied."""

    def __init__(self) -> None:
        super().__init__(EMAIL_REFUSED_MESSAGE, status_code=422, details={"code": "email_unusable"})


def hash_email(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()


def normalize_email(email: str | None) -> str | None:
    value = (email or "").strip().lower()
    return value or None


def _to_response(account: AccountRow) -> ManagedUserResponse:
    return ManagedUserResponse(
        user_id=account.user_id, email=account.email, full_name=account.full_name,
        role=account.role, banned=account.banned,
    )


class ManagedUserService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = ManagedUserRepository(session)

    async def email_is_usable(self, email: str) -> bool:
        bootstrap = normalize_email(await self.repo.get_bootstrap_email())
        if bootstrap and normalize_email(email) == bootstrap:
            return False
        return not await self.repo.email_has_account(email)

    def count_management_call(self, creator_id: str) -> None:
        enforce_user_limit(MANAGEMENT_SCOPE, creator_id, settings.USER_MANAGEMENT_RATE_LIMIT)

    def count_refusal(self, creator_id: str) -> None:
        enforce_user_limit(REFUSAL_SCOPE, creator_id, settings.USER_CREATE_REFUSAL_RATE_LIMIT)

    async def get_managed(self, creator_id: str, user_id: str) -> AccountRow:
        """The account, only if `creator_id` created it and it is still a `member` (else 404)."""
        account = await self.repo.get_account(user_id) if is_uuid(user_id) else None
        if account is None or account.created_by_user_id != creator_id or account.role != MEMBER_ROLE:
            raise ResourceNotFoundError("User", user_id)
        return account

    async def get_managed_response(self, creator_id: str, user_id: str) -> ManagedUserResponse:
        return _to_response(await self.get_managed(creator_id, user_id))

    async def list_managed(self, creator_id: str, page: int, page_size: int) -> ManagedUserListResponse:
        rows = await self.repo.list_created_by(creator_id, page_size, (page - 1) * page_size)
        return ManagedUserListResponse(
            items=[_to_response(r) for r in rows if r.role == MEMBER_ROLE],
            total=await self.repo.count_created_by(creator_id),
            page=page,
            page_size=page_size,
        )

    async def authorize_action(
        self, creator_id: str, user_id: str, body: ManagedUserActionRequest
    ) -> tuple[ManagedUserResponse, bool]:
        """Creator check, generic email refusal on edit, profile name update.

        Returns the target and whether the new email is refused (the caller audits, counts and raises).
        """
        self.count_management_call(creator_id)
        account = await self.get_managed(creator_id, user_id)
        new_email = normalize_email(body.email)
        if new_email and new_email != normalize_email(account.email):
            if not await self.email_is_usable(new_email):
                return _to_response(account), True
        if body.action == "edit" and body.full_name:
            await self.repo.update_full_name(user_id, body.full_name)
        return _to_response(account), False

    async def sync_bootstrap_email(self, email: str | None) -> str | None:
        """Startup: store the normalized env value (None = unset, nobody is promoted)."""
        normalized = normalize_email(email)
        await self.repo.set_bootstrap_email(normalized)
        return normalized
