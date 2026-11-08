"""Business members, per-area access (D-39), my access, presets and managed users (D-30)."""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AREA_MEMBERS, AreaRight
from app.core.dependencies import (
    get_current_user,
    get_db,
    require_business_access,
    require_business_member,
    require_idempotency_key,
)
from app.core.pagination import PageParams, page_params
from app.schemas.auth import CurrentUser
from app.schemas.request.member import (
    AddMemberRequest,
    EmailCheckRequest,
    ManagedUserActionRequest,
    MemberAccessRequest,
    UpdateMemberRequest,
)
from app.schemas.response.member import (
    AccessAreaListResponse,
    AccessPresetListResponse,
    ManagedUserListResponse,
    ManagedUserResponse,
    MemberAccessResponse,
    MemberListResponse,
    MemberResponse,
    MyBusinessAccessResponse,
    MyBusinessListResponse,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.idempotency_service import IdempotencyService, business_scope
from app.services.managed_user_service import EmailRefusedError, ManagedUserService, hash_email
from app.services.member_service import MemberService

router = APIRouter(tags=["Members"])

MEMBERS_PATH = "/businesses/{business_id}/members"
AUDIT_ENTITY = "Member"


async def _audit(
    db: AsyncSession, actor: str, action: str, entity_id: str | None,
    business_id: str | None = None, before=None, after=None, **details,
) -> None:
    await AuditService(db).record(
        actor, action, AUDIT_ENTITY, entity_id, business_id,
        before=before, after=after, details=details or None,
    )


# ---------------------------------------------------------------- members (owner only)


@router.get(MEMBERS_PATH, response_model=MemberListResponse)
async def list_members(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(AREA_MEMBERS, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> MemberListResponse:
    return await MemberService(db).list_members(ctx, params.page, params.page_size)


@router.post(MEMBERS_PATH, response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
async def add_member(
    body: AddMemberRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA_MEMBERS, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> MemberResponse:
    ManagedUserService(db).count_management_call(ctx.user_id)

    async def create() -> MemberResponse:
        member = await MemberService(db).add_member(ctx, body)
        await _audit(db, ctx.user_id, "member_added", member.id, ctx.business_id, after=member)
        return member

    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA_MEMBERS, "POST members"), body, create
    )


@router.patch(f"{MEMBERS_PATH}/{{member_id}}", response_model=MemberResponse)
async def update_member(
    member_id: str,
    body: UpdateMemberRequest,
    ctx: BusinessContext = Depends(require_business_access(AREA_MEMBERS, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> MemberResponse:
    member = await MemberService(db).update_status(ctx, member_id, body)
    await _audit(db, ctx.user_id, f"member_{body.status}", member.id, business_id=ctx.business_id,
                 target_user_id=member.user_id)
    return MemberResponse(
        id=member.id, user_id=member.user_id, access_mode=member.access_mode, status=body.status,
        version=member.version, is_owner=False, created_at=member.created_at,
    )


@router.delete(f"{MEMBERS_PATH}/{{member_id}}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    member_id: str,
    ctx: BusinessContext = Depends(require_business_access(AREA_MEMBERS, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> Response:
    user_id = await MemberService(db).remove_member(ctx, member_id)
    await _audit(db, ctx.user_id, "member_removed", member_id, business_id=ctx.business_id,
                 target_user_id=user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(f"{MEMBERS_PATH}/{{member_id}}/access", response_model=MemberAccessResponse)
async def get_member_access(
    member_id: str,
    ctx: BusinessContext = Depends(require_business_access(AREA_MEMBERS, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> MemberAccessResponse:
    return await MemberService(db).get_access(ctx, member_id)


@router.put(f"{MEMBERS_PATH}/{{member_id}}/access", response_model=MemberAccessResponse)
async def put_member_access(
    member_id: str,
    body: MemberAccessRequest,
    ctx: BusinessContext = Depends(require_business_access(AREA_MEMBERS, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> MemberAccessResponse:
    change = await MemberService(db).put_access(ctx, member_id, body)
    await _audit(db, ctx.user_id, "member_access_changed", member_id, business_id=ctx.business_id,
                 access_mode=change.response.access_mode, before=change.before, after=change.after)
    return change.response


@router.post(
    "/businesses/{business_id}/users/email-check",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def check_new_user_email(
    body: EmailCheckRequest,
    ctx: BusinessContext = Depends(require_business_access(AREA_MEMBERS, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> Response:
    """Step 1 of creating a business user (Next.js): owner only; refused emails are generic."""
    service = ManagedUserService(db)
    service.count_management_call(ctx.user_id)
    if not await service.email_is_usable(body.email):
        await _audit(db, ctx.user_id, "user_create_refused", None, business_id=ctx.business_id,
                     email_sha256=hash_email(body.email))
        await db.commit()  # the refusal audit row survives the error response
        service.count_refusal(ctx.user_id)
        raise EmailRefusedError()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- my access


@router.get("/businesses/{business_id}/me", response_model=MyBusinessAccessResponse)
async def my_business_access(
    ctx: BusinessContext = Depends(require_business_member()),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> MyBusinessAccessResponse:
    """My rights per area in this business, for UI hiding only (the server checks every route)."""
    return await MemberService(db).my_access(ctx)


@router.get("/me/businesses", response_model=MyBusinessListResponse)
async def my_businesses(
    params: PageParams = Depends(page_params),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> MyBusinessListResponse:
    return await MemberService(db).list_my_businesses(
        current_user.user_id, params.page, params.page_size
    )


@router.get(
    "/access-areas",
    response_model=AccessAreaListResponse,
    dependencies=[Depends(get_current_user)],
)
async def list_access_areas(
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> AccessAreaListResponse:
    """The rows of the custom access grid: grantable areas (no owner-only or platform areas)."""
    return await MemberService(db).list_areas(params)


@router.get(
    "/access-presets",
    response_model=AccessPresetListResponse,
    dependencies=[Depends(get_current_user)],
)
async def list_access_presets(
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> AccessPresetListResponse:
    return await MemberService(db).list_presets(params)


# ---------------------------------------------------------------- managed users (creator only)


@router.get("/managed-users", response_model=ManagedUserListResponse)
async def list_managed_users(
    params: PageParams = Depends(page_params),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ManagedUserListResponse:
    """The member accounts the caller created (the picker for 'add one of my users')."""
    return await ManagedUserService(db).list_managed(
        current_user.user_id, params.page, params.page_size
    )


@router.post("/managed-users/{user_id}/actions", response_model=ManagedUserResponse)
async def authorize_managed_user_action(
    user_id: str,
    body: ManagedUserActionRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ManagedUserResponse:
    """Authorize and audit one account action of the Next.js routes (404 unless the caller created it)."""
    service = ManagedUserService(db)
    account, refused = await service.authorize_action(current_user.user_id, user_id, body)
    if refused:
        await _audit(db, current_user.user_id, "user_email_change_refused", user_id,
                     email_sha256=hash_email(body.email or ""))
        await db.commit()  # the refusal audit row survives the error response
        service.count_refusal(current_user.user_id)
        raise EmailRefusedError()
    await _audit(db, current_user.user_id, f"user_{body.action}", user_id,
                 email_changed=body.email is not None, name_changed=body.full_name is not None)
    return account
