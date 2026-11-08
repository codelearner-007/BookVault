"""Audit log endpoints: my own actions, and the history of a business."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import (
    get_current_user,
    get_db,
    require_business_access,
    require_live_super_admin,
    require_role,
)
from app.core.pagination import PageParams, page_params
from app.models.audit_log import SCOPE_PLATFORM
from app.repositories.audit_repository import AuditFilter
from app.schemas.auth import CurrentUser
from app.schemas.common import IdStr, KEY_MAX, PaginatedResponse
from app.schemas.response.audit import AuditLogResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService

router = APIRouter(tags=["Audit"])


@router.get(
    "/audit/logs",
    response_model=PaginatedResponse[AuditLogResponse],
    dependencies=[Depends(require_role("admin", "super_admin"))],
)
async def list_audit_logs(
    params: PageParams = Depends(page_params),
    entity_type: Optional[str] = Query(None, max_length=KEY_MAX),
    action: Optional[str] = Query(None, max_length=KEY_MAX),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    business_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db, scope="function"),
    current_user: CurrentUser = Depends(get_current_user),
) -> PaginatedResponse[AuditLogResponse]:
    """Audit rows of the caller (always scoped to the caller)."""
    f = AuditFilter(
        user_id=current_user.user_id,
        business_id=str(business_id) if business_id else None,
        entity_type=entity_type,
        action=action,
        start_date=start_date,
        end_date=end_date,
    )
    return await AuditService(db).list_page(f, params)


@router.get(
    "/businesses/{business_id}/history",
    response_model=PaginatedResponse[AuditLogResponse],
)
async def list_business_history(
    params: PageParams = Depends(page_params),
    entity_type: Optional[str] = Query(None, max_length=KEY_MAX),
    action: Optional[str] = Query(None, max_length=KEY_MAX),
    user_id: Optional[IdStr] = Query(None),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    ctx: BusinessContext = Depends(require_business_access("history", AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> PaginatedResponse[AuditLogResponse]:
    """Every audited change of the business (history:view), filterable by record type, action, user and dates."""
    f = AuditFilter(
        business_id=ctx.business_id,
        user_id=user_id,
        entity_type=entity_type,
        action=action,
        start_date=start_date,
        end_date=end_date,
    )
    return await AuditService(db).list_page(f, params)


@router.get(
    "/platform/audit",
    response_model=PaginatedResponse[AuditLogResponse],
    dependencies=[Depends(require_live_super_admin)],
)
async def list_platform_audit(
    params: PageParams = Depends(page_params),
    entity_type: Optional[str] = Query(None, max_length=KEY_MAX),
    action: Optional[str] = Query(None, max_length=KEY_MAX),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> PaginatedResponse[AuditLogResponse]:
    """Platform-scope audit rows of every actor (live super admin, AAL2).

    Business-scope rows (tenant books) are never returned here: they stay in each business's history.
    """
    f = AuditFilter(
        scope=SCOPE_PLATFORM,
        entity_type=entity_type,
        action=action,
        start_date=start_date,
        end_date=end_date,
    )
    return await AuditService(db).list_page(f, params)


@router.get(
    "/modules",
    response_model=PaginatedResponse[str],
    dependencies=[Depends(require_role("admin", "super_admin"))],
)
async def list_audit_entity_types(
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> PaginatedResponse[str]:
    """Distinct entity types in the audit trail (filter of the audit page)."""
    return await AuditService(db).list_entity_types(params)
