"""Business membership and per-area access: data access only."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import delete, func, insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.business_member import (
    AccessPreset,
    AccessPresetRight,
    Area,
    AreaRightRef,
    BusinessMember,
    BusinessMemberAreaAccess,
    MemberStatusRef,
    Module,
)
from app.core.access_rights import PLATFORM_MODULE


@dataclass(frozen=True)
class MembershipRow:
    """The caller's membership in a business, with the access decision for one (area, right)."""

    owner_id: str
    deleted_at: datetime | None
    member_id: str
    access_mode: str
    status_key: str
    allowed: bool


_MEMBERSHIP_SQL = text(
    """
    SELECT b.owner_id::text, b.deleted_at, bm.id::text, bm.access_mode, s.key,
           CASE WHEN CAST(:area_key AS text) IS NULL THEN true
                ELSE public.member_has_area_access(
                    b.id, CAST(:user_id AS uuid), CAST(:area_key AS text), CAST(:right_key AS text))
           END
    FROM public.businesses b
    JOIN public.business_members bm
      ON bm.business_id = b.id AND bm.user_id = CAST(:user_id AS uuid)
    JOIN public.member_statuses s ON s.id = bm.status_id
    WHERE b.id = CAST(:business_id AS uuid)
    """
)

_MY_RIGHTS_SQL = text(
    """
    SELECT a.key, r.key
    FROM public.areas a
    CROSS JOIN public.area_rights r
    WHERE public.member_has_area_access(CAST(:business_id AS uuid), CAST(:user_id AS uuid), a.key, r.key)
    ORDER BY a.sort_order, r.sort_order
    """
)

_HAS_ACCESS_SQL = text(
    "SELECT public.member_has_area_access(CAST(:business_id AS uuid), CAST(:user_id AS uuid),"
    " CAST(:area_key AS text), CAST(:right_key AS text))"
)

_MEMBER_LIST_SQL = text(
    """
    SELECT bm.id::text, bm.user_id::text, u.email, p.full_name, bm.access_mode, s.key,
           bm.version, (b.owner_id = bm.user_id) AS is_owner, bm.created_at
    FROM public.business_members bm
    JOIN public.businesses b ON b.id = bm.business_id
    JOIN public.member_statuses s ON s.id = bm.status_id
    JOIN private.accounts u ON u.id = bm.user_id
    LEFT JOIN public.user_profiles p ON p.user_id = bm.user_id
    WHERE bm.business_id = CAST(:business_id AS uuid) AND s.key <> 'removed'
    ORDER BY bm.created_at
    LIMIT :limit OFFSET :offset
    """
)


class MemberRepository:
    """Queries over business_members, business_member_area_access and the access reference data."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ------------------------------------------------------------ access decision

    async def get_membership(
        self, business_id: str, user_id: str, area_key: str | None, right_key: str | None
    ) -> MembershipRow | None:
        result = await self.session.execute(
            _MEMBERSHIP_SQL,
            {"business_id": business_id, "user_id": user_id, "area_key": area_key, "right_key": right_key},
        )
        row = result.first()
        return MembershipRow(*row) if row else None

    async def list_my_rights(self, business_id: str, user_id: str) -> list[tuple[str, str]]:
        result = await self.session.execute(
            _MY_RIGHTS_SQL, {"business_id": business_id, "user_id": user_id}
        )
        return [(area, right) for area, right in result.all()]

    async def has_area_access(
        self, business_id: str, user_id: str, area_key: str, right_key: str
    ) -> bool:
        result = await self.session.execute(
            _HAS_ACCESS_SQL,
            {"business_id": business_id, "user_id": user_id, "area_key": area_key, "right_key": right_key},
        )
        return bool(result.scalar())

    # ------------------------------------------------------------ reference data

    async def list_area_flags(self) -> list[tuple[str, bool, bool, bool]]:
        """(area_key, is_owner_only, is_view_only, is_platform) for every area."""
        result = await self.session.execute(
            select(Area.key, Area.is_owner_only, Area.is_view_only, Module.key == PLATFORM_MODULE)
            .join(Module, Module.id == Area.module_id)
            .order_by(Area.sort_order)
        )
        return [tuple(row) for row in result.all()]

    async def list_tab_areas(self) -> dict[str, str]:
        result = await self.session.execute(select(Area.tab_key, Area.key).where(Area.tab_key.is_not(None)))
        return {tab_key: area_key for tab_key, area_key in result.all()}

    async def get_area_key_for_tab(self, tab_key: str) -> str | None:
        result = await self.session.execute(select(Area.key).where(Area.tab_key == tab_key))
        return result.scalars().first()

    async def list_right_keys(self) -> list[str]:
        result = await self.session.execute(select(AreaRightRef.key).order_by(AreaRightRef.sort_order))
        return list(result.scalars().all())

    async def list_presets(self) -> list[tuple[str, str, list[tuple[str, str]]]]:
        presets = (
            await self.session.execute(
                select(AccessPreset.id, AccessPreset.key, AccessPreset.label).order_by(AccessPreset.sort_order)
            )
        ).all()
        rights = (
            await self.session.execute(
                select(AccessPresetRight.preset_id, AccessPresetRight.area_key, AccessPresetRight.right_key)
                .join(Area, Area.key == AccessPresetRight.area_key)
                .join(AreaRightRef, AreaRightRef.key == AccessPresetRight.right_key)
                .order_by(Area.sort_order, AreaRightRef.sort_order)
            )
        ).all()
        by_preset: dict[str, list[tuple[str, str]]] = {}
        for preset_id, area_key, right_key in rights:
            by_preset.setdefault(preset_id, []).append((area_key, right_key))
        return [(key, label, by_preset.get(pid, [])) for pid, key, label in presets]

    async def get_status_id(self, status_key: str) -> str:
        result = await self.session.execute(
            select(MemberStatusRef.id).where(MemberStatusRef.key == status_key)
        )
        return result.scalar_one()

    # ------------------------------------------------------------ members

    async def list_members(self, business_id: str, limit: int, offset: int) -> list[dict]:
        result = await self.session.execute(
            _MEMBER_LIST_SQL, {"business_id": business_id, "limit": limit, "offset": offset}
        )
        return [dict(row._mapping) for row in result.all()]

    async def count_members(self, business_id: str) -> int:
        result = await self.session.execute(
            select(func.count())
            .select_from(BusinessMember)
            .join(MemberStatusRef, MemberStatusRef.id == BusinessMember.status_id)
            .where(BusinessMember.business_id == business_id, MemberStatusRef.key != "removed")
        )
        return int(result.scalar_one())

    async def get_member(self, business_id: str, member_id: str, lock: bool = False) -> BusinessMember | None:
        query = select(BusinessMember).where(
            BusinessMember.business_id == business_id, BusinessMember.id == member_id
        )
        if lock:
            query = query.with_for_update()
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_member_by_user(self, business_id: str, user_id: str) -> BusinessMember | None:
        result = await self.session.execute(
            select(BusinessMember).where(
                BusinessMember.business_id == business_id, BusinessMember.user_id == user_id
            )
        )
        return result.scalar_one_or_none()

    async def get_status_key(self, status_id: str) -> str:
        result = await self.session.execute(
            select(MemberStatusRef.key).where(MemberStatusRef.id == status_id)
        )
        return result.scalar_one()

    async def add_member(self, member: BusinessMember) -> BusinessMember:
        self.session.add(member)
        await self.session.flush()
        await self.session.refresh(member)
        return member

    async def delete_member(self, member: BusinessMember) -> None:
        await self.session.delete(member)
        await self.session.flush()

    async def flush(self, member: BusinessMember) -> BusinessMember:
        await self.session.flush()
        await self.session.refresh(member)
        return member

    async def list_area_access(self, member_id: str) -> list[tuple[str, str]]:
        result = await self.session.execute(
            select(BusinessMemberAreaAccess.area_key, BusinessMemberAreaAccess.right_key)
            .join(Area, Area.key == BusinessMemberAreaAccess.area_key)
            .join(AreaRightRef, AreaRightRef.key == BusinessMemberAreaAccess.right_key)
            .where(BusinessMemberAreaAccess.business_member_id == member_id)
            .order_by(Area.sort_order, AreaRightRef.sort_order)
        )
        return [(area, right) for area, right in result.all()]

    async def replace_area_access(
        self, business_id: str, member_id: str, pairs: list[tuple[str, str]]
    ) -> None:
        await self.session.execute(
            delete(BusinessMemberAreaAccess).where(
                BusinessMemberAreaAccess.business_member_id == member_id
            )
        )
        if pairs:
            await self.session.execute(
                insert(BusinessMemberAreaAccess),
                [
                    {"business_id": business_id, "business_member_id": member_id,
                     "area_key": area, "right_key": right}
                    for area, right in pairs
                ],
            )
        await self.session.flush()

    # ------------------------------------------------------------ businesses of a user

    async def list_user_businesses(
        self, user_id: str, limit: int, offset: int
    ) -> list[tuple[Business, bool]]:
        """Active businesses the user is an active member of (owners included), newest first."""
        query = (
            select(Business, Business.owner_id == user_id)
            .join(BusinessMember, BusinessMember.business_id == Business.id)
            .join(MemberStatusRef, MemberStatusRef.id == BusinessMember.status_id)
            .where(
                BusinessMember.user_id == user_id,
                MemberStatusRef.key == "active",
                Business.deleted_at.is_(None),
            )
            .order_by(Business.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(query)
        return [(business, bool(is_owner)) for business, is_owner in result.all()]

    async def count_user_businesses(self, user_id: str) -> int:
        result = await self.session.execute(
            select(func.count())
            .select_from(BusinessMember)
            .join(Business, Business.id == BusinessMember.business_id)
            .join(MemberStatusRef, MemberStatusRef.id == BusinessMember.status_id)
            .where(
                BusinessMember.user_id == user_id,
                MemberStatusRef.key == "active",
                Business.deleted_at.is_(None),
            )
        )
        return int(result.scalar_one())
