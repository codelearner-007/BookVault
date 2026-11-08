"""Business endpoints."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AREA_ACCOUNT_BUSINESSES, AreaRight
from app.core.config import settings
from app.core.dependencies import (
    get_current_user,
    get_db,
    require_business_access,
    require_business_creator,
    require_business_member,
)
from app.schemas.auth import CurrentUser
from app.schemas.request.business import CreateBusinessRequest, UpdateBusinessRequest
from app.schemas.request.tab import UpsertBusinessTabsRequest
from app.schemas.response.business import BusinessListResponse, BusinessResponse
from app.schemas.response.member import MyBusinessListResponse
from app.schemas.response.tab import BusinessTabListResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.business_service import BusinessService
from app.services.member_service import MemberService

_OWNER_ONLY = require_business_access(AREA_ACCOUNT_BUSINESSES, AreaRight.DELETE)
_OWNER_ONLY_INCLUDING_DELETED = require_business_access(
    AREA_ACCOUNT_BUSINESSES, AreaRight.DELETE, include_deleted=True
)
_DETAILS_EDIT = require_business_access("settings.business_details", AreaRight.EDIT)

router = APIRouter(prefix="/businesses", tags=["Businesses"])


@router.get("", response_model=MyBusinessListResponse)
async def list_businesses(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.PAGE_SIZE_DEFAULT, ge=1, le=settings.PAGE_SIZE_MAX),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> MyBusinessListResponse:
    """Businesses I own or am an active member of (alias of GET /me/businesses)."""
    return await MemberService(db).list_my_businesses(current_user.user_id, page, page_size)


@router.post(
    "",
    response_model=BusinessResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_business_creator)],
)
async def create_business(
    body: CreateBusinessRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> BusinessResponse:
    """Create a new business owned by the requesting user."""
    service = BusinessService(db)
    business = await service.create(
        owner_id=str(current_user.user_id),
        name=body.name,
        country=body.country,
    )

    audit_service = AuditService(db)
    await audit_service.log_action(
        user_id=current_user.user_id,
        action="business_created",
        module="businesses",
        resource_id=str(business.id),
        details={"name": business.name, "country": business.country, "owner_id": str(business.owner_id)},
    )

    return business


@router.get("/deleted", response_model=BusinessListResponse)
async def list_deleted_businesses(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> BusinessListResponse:
    """List soft-deleted businesses owned by the requesting user."""
    service = BusinessService(db)
    return await service.list_deleted_by_owner(str(current_user.user_id))


@router.get(
    "/{business_id}",
    response_model=BusinessResponse,
)
async def get_business(
    business_id: str,
    ctx: BusinessContext = Depends(require_business_member()),
    db: AsyncSession = Depends(get_db),
) -> BusinessResponse:
    """Get a business I am an active member of."""
    return await BusinessService(db).get(business_id, ctx.owner_id)


@router.delete(
    "/{business_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(_OWNER_ONLY)],
)
async def delete_business(
    business_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Soft-delete a business by ID. Requires admin or super_admin role."""
    service = BusinessService(db)
    deleted_name = await service.delete(business_id, str(current_user.user_id))

    audit_service = AuditService(db)
    await audit_service.log_action(
        user_id=current_user.user_id,
        action="business_deleted",
        module="businesses",
        resource_id=str(business_id),
        details={"name": deleted_name},
    )

    return {"ok": True}


@router.delete(
    "/{business_id}/permanent",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(_OWNER_ONLY_INCLUDING_DELETED)],
)
async def permanently_delete_business(
    business_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Permanently delete a soft-deleted business. This action is irreversible. Requires admin or super_admin role."""
    service = BusinessService(db)
    name = await service.hard_delete(business_id, str(current_user.user_id))

    audit_service = AuditService(db)
    await audit_service.log_action(
        user_id=current_user.user_id,
        action="business_permanently_deleted",
        module="businesses",
        resource_id=str(business_id),
        details={"name": name},
    )

    return {"ok": True}


@router.post(
    "/{business_id}/restore",
    response_model=BusinessResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(_OWNER_ONLY_INCLUDING_DELETED)],
)
async def restore_business(
    business_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> BusinessResponse:
    """Restore a soft-deleted business by ID. Requires admin or super_admin role."""
    service = BusinessService(db)
    restored_business = await service.restore(business_id, str(current_user.user_id))

    audit_service = AuditService(db)
    await audit_service.log_action(
        user_id=current_user.user_id,
        action="business_restored",
        module="businesses",
        resource_id=str(business_id),
        details={"name": restored_business.name},
    )

    return restored_business


@router.put(
    "/{business_id}",
    response_model=BusinessResponse,
)
async def update_business(
    business_id: str,
    body: UpdateBusinessRequest,
    ctx: BusinessContext = Depends(_DETAILS_EDIT),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> BusinessResponse:
    """Update business name, country, and address."""
    service = BusinessService(db)
    business = await service.update(
        business_id=business_id,
        owner_id=ctx.owner_id,
        name=body.name,
        country=body.country,
        address=body.address,
    )

    audit_service = AuditService(db)
    await audit_service.log_action(
        user_id=current_user.user_id,
        action="business_updated",
        module="businesses",
        resource_id=str(business_id),
        details={"name": body.name, "country": body.country, "address": body.address},
    )

    return business


@router.post(
    "/{business_id}/reset",
    response_model=BusinessResponse,
    status_code=status.HTTP_200_OK,
)
async def reset_business(
    business_id: str,
    ctx: BusinessContext = Depends(_DETAILS_EDIT),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> BusinessResponse:
    """Reset business country and address to null."""
    service = BusinessService(db)
    business = await service.reset(business_id, ctx.owner_id)

    audit_service = AuditService(db)
    await audit_service.log_action(
        user_id=current_user.user_id,
        action="business_reset",
        module="businesses",
        resource_id=str(business_id),
        details={"name": business.name},
    )

    return business


@router.get(
    "/{business_id}/tabs",
    response_model=BusinessTabListResponse,
)
async def list_business_tabs(
    business_id: str,
    ctx: BusinessContext = Depends(require_business_member()),
    db: AsyncSession = Depends(get_db),
) -> BusinessTabListResponse:
    """Tabs of the business (globally enabled); only the ones I can view when my access is custom."""
    tabs = await BusinessService(db).list_business_tabs(business_id, ctx.owner_id)
    return await MemberService(db).visible_tabs(ctx, tabs)


@router.put(
    "/{business_id}/tabs",
    response_model=BusinessTabListResponse,
)
async def upsert_business_tabs(
    business_id: str,
    body: UpsertBusinessTabsRequest,
    ctx: BusinessContext = Depends(require_business_access("settings.customize_tabs", AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db),
) -> BusinessTabListResponse:
    """Update tab enabled/order configuration of the business."""
    return await BusinessService(db).upsert_business_tabs(business_id, ctx.owner_id, body.items)
