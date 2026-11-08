"""Dashboard endpoints: the caller's own numbers and the workspace dashboard."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db, require_role
from app.core.pagination import SEARCH_MAX, PageParams, page_params
from app.schemas.auth import CurrentUser
from app.schemas.response.dashboard import DashboardStatsResponse, WorkspaceDashboardResponse
from app.services.dashboard_service import DashboardService

router = APIRouter(tags=["Dashboard"])


@router.get("/dashboard/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    current_user: CurrentUser = Depends(require_role("admin", "super_admin")),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> DashboardStatsResponse:
    """My businesses and my audited actions (admin and super admin alike, CS-21)."""
    return await DashboardService(db).get_stats(current_user.user_id)


@router.get("/me/dashboard", response_model=WorkspaceDashboardResponse)
async def get_workspace_dashboard(
    params: PageParams = Depends(page_params),
    search: Optional[str] = Query(None, max_length=SEARCH_MAX),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> WorkspaceDashboardResponse:
    """My businesses (paginated, name search) with the ledger figures I may view, and recent activity."""
    return await DashboardService(db).workspace(current_user.user_id, params, search, date.today())
