"""Entitlements: the ONE place that decides whether a user may create a business (D-01).

Today: platform role super_admin or admin (read live). Later: subscription status and
plan limit, added here and nowhere else (test_can_create_business_is_single_decision_point).
"""

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.auth import CurrentUser
from app.services.user_role_service import UserRoleService

BUSINESS_CREATOR_ROLES = frozenset({"super_admin", "admin"})


@dataclass(frozen=True)
class Decision:
    allowed: bool
    reason: str = ""


async def can_create_business(session: AsyncSession, user: CurrentUser) -> Decision:
    role = await UserRoleService(session).get_live_role_name(user.user_id)
    if role in BUSINESS_CREATOR_ROLES:
        return Decision(allowed=True)
    return Decision(allowed=False, reason="Your account cannot create businesses")
