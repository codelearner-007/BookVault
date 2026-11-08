"""Business endpoints (incl. the business tab configuration)."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AREA_ACCOUNT_BUSINESSES, AreaRight
from app.core.dependencies import (
    get_current_user,
    get_db,
    require_business_access,
    require_business_creator,
    require_business_member,
    require_idempotency_key,
)
from app.core.pagination import PageParams, page_params
from app.schemas.auth import CurrentUser
from app.schemas.common import PaginatedResponse
from app.schemas.request.business import CreateBusinessRequest, UpdateBusinessRequest
from app.schemas.request.tab import UpsertBusinessTabsRequest
from app.schemas.response.business import BusinessResponse
from app.schemas.response.member import MyBusinessListResponse
from app.schemas.response.tab import BusinessTabResponse
from app.services.access_service import BusinessContext
from app.services.business_service import BusinessService
from app.services.idempotency_service import IdempotencyScope, IdempotencyService
from app.services.member_service import MemberService
from app.services.tab_service import TabService

_OWNER_ONLY = require_business_access(AREA_ACCOUNT_BUSINESSES, AreaRight.DELETE)
_OWNER_ONLY_INCLUDING_DELETED = require_business_access(
    AREA_ACCOUNT_BUSINESSES, AreaRight.DELETE, include_deleted=True
)
_DETAILS_EDIT = require_business_access("settings.business_details", AreaRight.EDIT)
_TABS_EDIT = require_business_access("settings.customize_tabs", AreaRight.EDIT)

router = APIRouter(prefix="/businesses", tags=["Businesses"])


@router.get("", response_model=MyBusinessListResponse)
async def list_businesses(
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> MyBusinessListResponse:
    """Businesses I own or am an active member of (alias of GET /me/businesses)."""
    return await MemberService(db).list_my_businesses(
        current_user.user_id, params.page, params.page_size
    )


@router.post("", response_model=BusinessResponse, status_code=status.HTTP_201_CREATED)
async def create_business(
    body: CreateBusinessRequest,
    key: str = Depends(require_idempotency_key),
    current_user: CurrentUser = Depends(require_business_creator),
    db: AsyncSession = Depends(get_db),
) -> BusinessResponse:
    """Create a business owned by the caller (no business exists yet: platform-level key)."""
    scope = IdempotencyScope(key, current_user.user_id, None, None, "POST businesses")
    return await IdempotencyService(db).run(
        scope, body, lambda: BusinessService(db).create(current_user.user_id, body)
    )


@router.get("/deleted", response_model=PaginatedResponse[BusinessResponse])
async def list_deleted_businesses(
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> PaginatedResponse[BusinessResponse]:
    """My businesses in Trash."""
    return await BusinessService(db).list_deleted(current_user.user_id, params)


@router.get("/{business_id}", response_model=BusinessResponse)
async def get_business(
    ctx: BusinessContext = Depends(require_business_member()),
    db: AsyncSession = Depends(get_db),
) -> BusinessResponse:
    return await BusinessService(db).get(ctx)


@router.put("/{business_id}", response_model=BusinessResponse)
async def update_business(
    body: UpdateBusinessRequest,
    ctx: BusinessContext = Depends(_DETAILS_EDIT),
    db: AsyncSession = Depends(get_db),
) -> BusinessResponse:
    """Update name, country and address (needs the version read by the client)."""
    return await BusinessService(db).update(ctx, body)


@router.delete("/{business_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_business(
    ctx: BusinessContext = Depends(_OWNER_ONLY),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Move the business to Trash (owner only)."""
    await BusinessService(db).soft_delete(ctx)


@router.delete("/{business_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def permanently_delete_business(
    ctx: BusinessContext = Depends(_OWNER_ONLY_INCLUDING_DELETED),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a business in Trash (owner only, irreversible)."""
    await BusinessService(db).hard_delete(ctx)


@router.post("/{business_id}/restore", response_model=BusinessResponse)
async def restore_business(
    ctx: BusinessContext = Depends(_OWNER_ONLY_INCLUDING_DELETED),
    db: AsyncSession = Depends(get_db),
) -> BusinessResponse:
    return await BusinessService(db).restore(ctx)


@router.post("/{business_id}/reset", response_model=BusinessResponse)
async def reset_business(
    ctx: BusinessContext = Depends(_DETAILS_EDIT),
    db: AsyncSession = Depends(get_db),
) -> BusinessResponse:
    """Clear country and address."""
    return await BusinessService(db).reset(ctx)


@router.get("/{business_id}/tabs", response_model=PaginatedResponse[BusinessTabResponse])
async def list_business_tabs(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_member()),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[BusinessTabResponse]:
    """Tabs of the business; a custom member sees only tabs whose area it can view."""
    tabs = await MemberService(db).visible_tabs(ctx, await TabService(db).list_business_tabs(ctx.business_id))
    return PaginatedResponse.build(params.slice(tabs), len(tabs), params.page, params.page_size)


@router.put("/{business_id}/tabs", response_model=PaginatedResponse[BusinessTabResponse])
async def upsert_business_tabs(
    body: UpsertBusinessTabsRequest,
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(_TABS_EDIT),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[BusinessTabResponse]:
    """Save enabled/order of the business tabs (unknown keys and orphan children -> 422)."""
    tabs = await TabService(db).upsert_business_tabs(ctx, body.items)
    return PaginatedResponse.build(params.slice(tabs), len(tabs), params.page, params.page_size)
