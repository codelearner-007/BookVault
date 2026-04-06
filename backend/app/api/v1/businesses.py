"""Business endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db, require_role
from app.schemas.auth import CurrentUser
from app.schemas.request.business import CreateBusinessRequest
from app.schemas.request.tab import UpsertBusinessTabsRequest
from app.schemas.response.business import BusinessListResponse, BusinessResponse
from app.schemas.response.tab import BusinessTabListResponse
from app.services.audit_service import AuditService
from app.services.business_service import BusinessService

router = APIRouter(prefix="/businesses", tags=["Businesses"])


@router.get(
    "",
    response_model=BusinessListResponse,
    dependencies=[Depends(require_role("admin", "super_admin"))],
)
async def list_businesses(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> BusinessListResponse:
    """List businesses owned by the requesting user."""
    service = BusinessService(db)
    return await service.list_by_owner(str(current_user.user_id))


@router.post(
    "",
    response_model=BusinessResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("admin", "super_admin"))],
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


@router.get(
    "/deleted",
    response_model=BusinessListResponse,
    dependencies=[Depends(require_role("admin", "super_admin"))],
)
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
    dependencies=[Depends(require_role("admin", "super_admin"))],
)
async def get_business(
    business_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> BusinessResponse:
    """Get a single business by ID owned by the requesting user."""
    service = BusinessService(db)
    return await service.get(business_id, str(current_user.user_id))


@router.delete(
    "/{business_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_role("admin", "super_admin"))],
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
    dependencies=[Depends(require_role("admin", "super_admin"))],
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
    dependencies=[Depends(require_role("admin", "super_admin"))],
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


@router.get(
    "/{business_id}/tabs",
    response_model=BusinessTabListResponse,
    dependencies=[Depends(require_role("admin", "super_admin"))],
)
async def list_business_tabs(
    business_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> BusinessTabListResponse:
    """List tabs for a specific business owned by the requesting user, filtered by globally-enabled admin tabs."""
    service = BusinessService(db)
    return await service.list_business_tabs(business_id, str(current_user.user_id))


@router.put(
    "/{business_id}/tabs",
    response_model=BusinessTabListResponse,
    dependencies=[Depends(require_role("admin", "super_admin"))],
)
async def upsert_business_tabs(
    business_id: str,
    body: UpsertBusinessTabsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> BusinessTabListResponse:
    """Update tab enabled/order configuration for a specific business owned by the requesting user."""
    service = BusinessService(db)
    return await service.upsert_business_tabs(business_id, str(current_user.user_id), body.items)
