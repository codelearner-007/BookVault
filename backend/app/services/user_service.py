"""User management service."""

from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException, InvalidTokenError
from app.repositories.business_repository import BusinessRepository
from app.repositories.user_repository import UserRepository
from app.repositories.user_role_repository import UserRoleRepository
from app.schemas.common import PaginatedResponse
from app.schemas.response.user import (
    UserAccessSummaryResponse,
    UserStatsResponse,
    UserWithRolesResponse,
)
from app.services.user_role_service import UserRoleService
from app.schemas.response.user_role import UserRoleResponse


MFA_AAL = "aal2"


class UserService:
    """Service for user management operations."""

    def __init__(self, session: AsyncSession):
        self.user_repo = UserRepository(session)
        self.user_role_repo = UserRoleRepository(session)
        self.user_role_service = UserRoleService(session)
        self.business_repo = BusinessRepository(session)

    async def assert_account_usable(self, aal: str | None, allow_pending_mfa: bool = False) -> None:
        """Live identity (CS-26, AC-12, AC-13): banned or deleted accounts and AAL1
        sessions of users with a verified MFA factor are refused, whatever the JWT says.

        allow_pending_mfa: only the recovery-code route accepts such an AAL1 session (D-23).
        """
        state = await self.user_repo.my_account_state()
        if state is None or state[0]:
            raise InvalidTokenError("Account is not active")
        if state[1] and aal != MFA_AAL and not allow_pending_mfa:
            raise AppException(
                "Two-factor verification required", status_code=403, details={"code": "mfa_required"}
            )

    async def has_verified_factor(self) -> bool:
        state = await self.user_repo.my_account_state()
        return bool(state and state[1])

    async def get_access_summary(self, user_id: str) -> UserAccessSummaryResponse:
        """Live platform role and owned-business count of a user (CS-04, CS-10)."""
        return UserAccessSummaryResponse(
            user_id=user_id,
            user_role=await self.user_role_service.get_live_role_name(user_id),
            owned_business_count=await self.business_repo.count_all_by_owner(user_id),
        )

    async def get_stats(self) -> UserStatsResponse:
        stats = await self.user_repo.get_stats()
        return UserStatsResponse(**stats)

    async def list_users_with_roles(
        self,
        page: int = 1,
        page_size: int = 20,
        role: Optional[str] = None,
        email_verified: Optional[bool] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        scope: Optional[str] = None,
    ) -> PaginatedResponse[UserWithRolesResponse]:
        total = await self.user_repo.count_filtered(
            role=role, email_verified=email_verified,
            status=status, search=search, scope=scope,
        )
        offset = (page - 1) * page_size
        total_pages = (total + page_size - 1) // page_size

        users = await self.user_repo.list_filtered(
            offset=offset, limit=page_size,
            role=role, email_verified=email_verified,
            status=status, search=search, scope=scope,
        )

        if not users:
            return PaginatedResponse(
                items=[], total=total, page=page,
                page_size=page_size, total_pages=total_pages,
            )

        # Compute is_banned for each user
        for user in users:
            banned_until = user["banned_until"]
            user["is_banned"] = (
                False if banned_until is None
                else banned_until > datetime.now(banned_until.tzinfo)
            )

        # Bulk fetch roles
        user_ids = [u["id"] for u in users]
        roles_by_user = await self.user_role_repo.list_by_users(user_ids)

        items = [
            UserWithRolesResponse(
                **user,
                roles=[
                    UserRoleResponse.model_validate(ur)
                    for ur in roles_by_user.get(user["id"], [])
                ],
            )
            for user in users
        ]

        return PaginatedResponse(
            items=items, total=total, page=page,
            page_size=page_size, total_pages=total_pages,
        )
