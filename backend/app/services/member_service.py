"""Business members and their access (owner-only management, D-30/D-32/D-39)."""

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams
from app.core.access_rights import AccessMode, AreaRight, MemberStatus
from app.core.exceptions import AppException, ImmutableResourceError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.models.business_member import BusinessMember
from app.repositories.managed_user_repository import ManagedUserRepository
from app.repositories.member_repository import MemberRepository
from app.schemas.request.member import (
    AddMemberRequest,
    AreaAccessIn,
    MemberAccessRequest,
    UpdateMemberRequest,
)
from app.schemas.response.business import BusinessResponse
from app.schemas.response.tab import BusinessTabResponse
from app.schemas.response.member import (
    AccessAreaListResponse,
    AccessAreaResponse,
    AccessPresetListResponse,
    AccessPresetResponse,
    AreaAccessOut,
    MemberAccessResponse,
    MemberListResponse,
    MemberResponse,
    MyBusinessAccessResponse,
    MyBusinessListResponse,
    MyBusinessResponse,
)
from app.services.access_service import AccessService, BusinessContext, group_pairs, normalize_grid

MEMBER_ROLE = "member"
SETTINGS_TAB = "settings"
SETTINGS_AREA_PREFIX = "settings."


class VersionConflictError(AppException):
    def __init__(self) -> None:
        super().__init__("This member was changed by someone else; reload and try again", 409)


@dataclass(frozen=True)
class AccessChange:
    response: MemberAccessResponse
    before: dict[str, list[str]]
    after: dict[str, list[str]]


def _grid(pairs: list[tuple[str, str]]) -> list[AreaAccessOut]:
    return [AreaAccessOut(area_key=k, rights=v) for k, v in group_pairs(pairs).items()]


class MemberService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = MemberRepository(session)
        self.accounts = ManagedUserRepository(session)
        self.access = AccessService(session)

    # ------------------------------------------------------------------ reads

    async def list_members(self, ctx: BusinessContext, page: int, page_size: int) -> MemberListResponse:
        rows = await self.repo.list_members(ctx.business_id, page_size, (page - 1) * page_size)
        total = await self.repo.count_members(ctx.business_id)
        items = [
            MemberResponse(
                id=r["id"], user_id=r["user_id"], email=r["email"], full_name=r["full_name"],
                access_mode=r["access_mode"], status=r["key"], version=r["version"],
                is_owner=r["is_owner"], created_at=r["created_at"],
            )
            for r in rows
        ]
        return MemberListResponse(items=items, total=total, page=page, page_size=page_size)

    async def get_access(self, ctx: BusinessContext, member_id: str) -> MemberAccessResponse:
        member = await self._get_member(ctx, member_id)
        return await self._access_response(member)

    async def my_access(self, ctx: BusinessContext) -> MyBusinessAccessResponse:
        rights = await self.access.my_rights(ctx)
        return MyBusinessAccessResponse(
            business_id=ctx.business_id,
            is_owner=ctx.is_owner,
            access_mode=ctx.access_mode,
            areas=[AreaAccessOut(area_key=k, rights=v) for k, v in rights.items()],
        )

    async def visible_tabs(
        self, ctx: BusinessContext, tabs: list[BusinessTabResponse]
    ) -> list[BusinessTabResponse]:
        """Owners and full members see every tab; a custom member only tabs whose area it can view."""
        if not AccessService.is_custom(ctx):
            return tabs
        viewable = {a for a, rights in (await self.access.my_rights(ctx)).items() if AreaRight.VIEW in rights}
        tab_areas = await self.repo.list_tab_areas()

        def visible(tab_key: str) -> bool:
            if tab_key == SETTINGS_TAB:
                return any(area.startswith(SETTINGS_AREA_PREFIX) for area in viewable)
            return tab_areas.get(tab_key) in viewable

        return [t for t in tabs if visible(t.key)]

    async def list_areas(self, params: PageParams) -> AccessAreaListResponse:
        areas = [
            AccessAreaResponse(key=key, label=label, tab_key=tab_key, is_view_only=view_only)
            for key, label, tab_key, view_only in await self.repo.list_grantable_areas()
        ]
        return AccessAreaListResponse(
            items=params.slice(areas), total=len(areas), page=params.page, page_size=params.page_size
        )

    async def list_presets(self, params: PageParams) -> AccessPresetListResponse:
        presets = [
            AccessPresetResponse(key=key, label=label, areas=_grid(pairs))
            for key, label, pairs in await self.repo.list_presets()
        ]
        return AccessPresetListResponse(
            items=params.slice(presets), total=len(presets), page=params.page, page_size=params.page_size
        )

    async def list_my_businesses(self, user_id: str, page: int, page_size: int) -> MyBusinessListResponse:
        rows = await self.repo.list_user_businesses(user_id, page_size, (page - 1) * page_size)
        total = await self.repo.count_user_businesses(user_id)
        items = [
            MyBusinessResponse(**BusinessResponse.model_validate(b).model_dump(), is_owner=is_owner)
            for b, is_owner in rows
        ]
        return MyBusinessListResponse(items=items, total=total, page=page, page_size=page_size)

    # ------------------------------------------------------------------ writes

    async def add_member(self, ctx: BusinessContext, body: AddMemberRequest) -> MemberResponse:
        """Add a `member` account the caller created to the caller's business (never by email)."""
        account = await self.accounts.get_account(body.user_id)
        if (
            account is None
            or account.created_by_user_id != ctx.user_id
            or account.role != MEMBER_ROLE
            or await self.repo.get_member_by_user(ctx.business_id, body.user_id) is not None
        ):
            raise ResourceNotFoundError("User", body.user_id)
        pairs = await self._normalized(body.access_mode, body.areas)
        member = await self.repo.add_member(
            BusinessMember(
                business_id=ctx.business_id,
                user_id=body.user_id,
                access_mode=body.access_mode.value,
                status_id=await self.repo.get_status_id(MemberStatus.ACTIVE),
                added_by_user_id=ctx.user_id,
            )
        )
        await self.repo.replace_area_access(ctx.business_id, member.id, pairs)
        return MemberResponse(
            id=member.id, user_id=member.user_id, email=account.email, full_name=account.full_name,
            access_mode=member.access_mode, status=MemberStatus.ACTIVE.value, version=member.version,
            is_owner=False, created_at=member.created_at,
        )

    async def update_status(
        self, ctx: BusinessContext, member_id: str, body: UpdateMemberRequest
    ) -> BusinessMember:
        member = await self._get_member(ctx, member_id, lock=True)
        self._refuse_owner_row(ctx, member)
        self._check_version(member, body.version)
        member.status_id = await self.repo.get_status_id(body.status)
        member.version += 1
        return await self.repo.flush(member)

    async def remove_member(self, ctx: BusinessContext, member_id: str) -> str:
        member = await self._get_member(ctx, member_id, lock=True)
        self._refuse_owner_row(ctx, member)
        user_id = member.user_id
        await self.repo.delete_member(member)
        return user_id

    async def put_access(
        self, ctx: BusinessContext, member_id: str, body: MemberAccessRequest
    ) -> AccessChange:
        """Replace the whole grid atomically under a lock on the member row (409 on stale version)."""
        member = await self._get_member(ctx, member_id, lock=True)
        self._refuse_owner_row(ctx, member)
        self._check_version(member, body.version)
        pairs = await self._normalized(body.access_mode, body.areas)
        before = group_pairs(await self.repo.list_area_access(member.id))
        await self.repo.replace_area_access(ctx.business_id, member.id, pairs)
        member.access_mode = body.access_mode.value
        member.version += 1
        member = await self.repo.flush(member)
        response = await self._access_response(member)
        return AccessChange(response, before, group_pairs(await self.repo.list_area_access(member.id)))

    # ------------------------------------------------------------------ helpers

    async def _normalized(self, mode: AccessMode, areas: list[AreaAccessIn]) -> list[tuple[str, str]]:
        pairs = normalize_grid(areas, await self.access.grantable_areas())
        return pairs if mode == AccessMode.CUSTOM else []

    async def _get_member(self, ctx: BusinessContext, member_id: str, lock: bool = False) -> BusinessMember:
        member = await self.repo.get_member(ctx.business_id, member_id, lock) if is_uuid(member_id) else None
        if member is None:
            raise ResourceNotFoundError("Member", member_id)
        return member

    async def _access_response(self, member: BusinessMember) -> MemberAccessResponse:
        return MemberAccessResponse(
            access_mode=member.access_mode,
            version=member.version,
            areas=_grid(await self.repo.list_area_access(member.id)),
        )

    @staticmethod
    def _refuse_owner_row(ctx: BusinessContext, member: BusinessMember) -> None:
        if member.user_id == ctx.owner_id:
            raise ImmutableResourceError(
                "Member", member.id, "The owner's membership cannot be changed or removed"
            )

    @staticmethod
    def _check_version(member: BusinessMember, version: int) -> None:
        if member.version != version:
            raise VersionConflictError()
