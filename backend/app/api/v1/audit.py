"""Audit log endpoints."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db, require_permission
from app.schemas.auth import CurrentUser
from app.schemas.common import PaginatedResponse
from app.schemas.response.audit import AuditLogResponse
from app.services.audit_service import AuditService

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get(
    "/logs",
    response_model=PaginatedResponse[AuditLogResponse],
    dependencies=[Depends(require_permission("audit:read"))],
)
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    module: Optional[str] = None,
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[AuditLogResponse]:
    """List all audit logs with pagination and filtering. Requires: audit:read"""
    service = AuditService(db)
    return await service.list_logs_paginated(
        page=page, page_size=page_size,
        module=module, action=action, user_id=user_id,
        start_date=start_date, end_date=end_date,
    )


@router.get(
    "/my-logs",
    response_model=PaginatedResponse[AuditLogResponse],
)
async def list_own_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    module: Optional[str] = None,
    action: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> PaginatedResponse[AuditLogResponse]:
    """List the current user's own audit logs. No special permission required."""
    service = AuditService(db)
    return await service.list_logs_paginated(
        page=page, page_size=page_size,
        module=module, action=action, user_id=current_user.user_id,
        start_date=start_date, end_date=end_date,
    )
