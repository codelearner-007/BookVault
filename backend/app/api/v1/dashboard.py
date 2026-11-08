"""Admin dashboard statistics endpoint (the caller's own data)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_role
from app.schemas.auth import CurrentUser
from app.schemas.response.dashboard import DashboardStatsResponse
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    current_user: CurrentUser = Depends(require_role("admin", "super_admin")),
    db: AsyncSession = Depends(get_db),
) -> DashboardStatsResponse:
    """My businesses and my audited actions (admin and super admin alike, CS-21)."""
    return await DashboardService(db).get_stats(current_user.user_id)
