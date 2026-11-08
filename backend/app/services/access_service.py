"""Business access: membership lookup, the exact per-area right check and grid normalization.

The decision itself is the SQL function public.member_has_area_access (one function for
the FastAPI dependency and, from B0.4, the RLS helper). This service only asks it.
"""

from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import IMPLIES_VIEW, AccessMode, AreaRight, MemberStatus
from app.core.exceptions import PermissionDeniedError, ValidationError
from app.core.ids import is_uuid
from app.repositories.member_repository import MemberRepository
from app.schemas.request.member import AreaAccessIn

BUSINESS_NOT_FOUND = "Business not found"


@dataclass(frozen=True)
class BusinessContext:
    """A verified caller-in-business; services take this, never a raw business id from a request."""

    business_id: str
    user_id: str
    member_id: str
    access_mode: str
    owner_id: str

    @property
    def is_owner(self) -> bool:
        return self.user_id == self.owner_id


@dataclass(frozen=True)
class GrantableArea:
    key: str
    is_view_only: bool


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=BUSINESS_NOT_FOUND)


def group_pairs(pairs: list[tuple[str, str]]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for area_key, right_key in pairs:
        grouped.setdefault(area_key, []).append(right_key)
    return grouped


def normalize_grid(
    items: list[AreaAccessIn], grantable: dict[str, GrantableArea]
) -> list[tuple[str, str]]:
    """Validate and normalize a custom grid: duplicates dropped, view added where implied.

    Unknown / owner-only / platform areas, non-view rights on view-only areas and more
    items than grantable areas are refused (422) before anything is written.
    """
    if len(items) > len(grantable):
        raise ValidationError("Too many areas", field="areas")
    rights_by_area: dict[str, set[AreaRight]] = {}
    for item in items:
        area = grantable.get(item.area_key)
        if area is None:
            raise ValidationError("This area cannot be granted", field="areas")
        rights = set(item.rights)
        if rights & IMPLIES_VIEW:
            rights.add(AreaRight.VIEW)
        if area.is_view_only and rights - {AreaRight.VIEW}:
            raise ValidationError("Only view can be granted on this area", field="areas")
        rights_by_area.setdefault(area.key, set()).update(rights)
    order = list(AreaRight)
    return [
        (area_key, right.value)
        for area_key, rights in rights_by_area.items()
        for right in sorted(rights, key=order.index)
    ]


class AccessService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = MemberRepository(session)

    async def resolve(
        self,
        business_id: str,
        user_id: str,
        area_key: str | None,
        right: AreaRight | None,
        include_deleted: bool = False,
    ) -> BusinessContext:
        """404 unless the caller is an active member of a live business; 403 without the right."""
        if not is_uuid(business_id):
            raise _not_found()
        row = await self.repo.get_membership(
            business_id, user_id, area_key, right.value if right else None
        )
        if row is None or row.status_key != MemberStatus.ACTIVE:
            raise _not_found()
        if row.deleted_at is not None and not include_deleted:
            raise _not_found()
        if not row.allowed:
            raise PermissionDeniedError(f"{area_key}:{right}")
        return BusinessContext(business_id, user_id, row.member_id, row.access_mode, row.owner_id)

    async def grantable_areas(self) -> dict[str, GrantableArea]:
        return {
            key: GrantableArea(key, is_view_only)
            for key, is_owner_only, is_view_only, is_platform in await self.repo.list_area_flags()
            if not is_owner_only and not is_platform
        }

    async def invalid_route_pairs(self, pairs: set[tuple[str, str]]) -> list[tuple[str, str]]:
        """Pairs that no caller could ever hold: unknown area or right, platform area,
        or a non-view right on a view-only area (checked at startup)."""
        flags = {key: (view_only, platform) for key, _, view_only, platform in await self.repo.list_area_flags()}
        rights = set(await self.repo.list_right_keys())
        invalid = []
        for area_key, right_key in sorted(pairs):
            view_only, platform = flags.get(area_key, (False, True))
            if right_key not in rights or platform or (view_only and right_key != AreaRight.VIEW):
                invalid.append((area_key, right_key))
        return invalid

    async def area_for_tab(self, tab_key: str) -> str | None:
        return await self.repo.get_area_key_for_tab(tab_key)

    async def my_rights(self, ctx: BusinessContext) -> dict[str, list[str]]:
        return group_pairs(await self.repo.list_my_rights(ctx.business_id, ctx.user_id))

    @staticmethod
    def is_custom(ctx: BusinessContext) -> bool:
        return not ctx.is_owner and ctx.access_mode == AccessMode.CUSTOM
