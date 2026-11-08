"""User management endpoints."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_live_super_admin
from app.core.pagination import SEARCH_MAX, PageParams, page_params
from app.schemas.common import KEY_MAX, PaginatedResponse
from app.schemas.response.user import (
    UserAccessSummaryResponse,
    UserStatsResponse,
    UserWithRolesResponse,
)
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "/stats",
    response_model=UserStatsResponse,
    dependencies=[Depends(require_live_super_admin)],
)
async def get_user_stats(
    db: AsyncSession = Depends(get_db),
) -> UserStatsResponse:
    """Get user statistics. Requires: users:read_all"""
    service = UserService(db)
    return await service.get_stats()


@router.get(
    "/with-roles",
    response_model=PaginatedResponse[UserWithRolesResponse],
    dependencies=[Depends(require_live_super_admin)],
)
async def list_users_with_roles(
    params: PageParams = Depends(page_params),
    role: Optional[str] = Query(None, max_length=KEY_MAX),
    email_verified: Optional[bool] = Query(None),
    status: Optional[str] = Query(None, max_length=KEY_MAX),
    search: Optional[str] = Query(None, max_length=SEARCH_MAX),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[UserWithRolesResponse]:
    """List users with pagination, filtering, and embedded roles. Requires: users:read_all"""
    service = UserService(db)
    return await service.list_users_with_roles(
        page=params.page, page_size=params.page_size,
        role=role, email_verified=email_verified,
        status=status, search=search,
    )


@router.get(
    "/{user_id}/access-summary",
    response_model=UserAccessSummaryResponse,
    dependencies=[Depends(require_live_super_admin)],
)
async def get_user_access_summary(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> UserAccessSummaryResponse:
    """Live role + owned businesses of a user; used by the Next.js user-admin routes."""
    return await UserService(db).get_access_summary(str(user_id))
