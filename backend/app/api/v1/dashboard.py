"""Admin dashboard statistics endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_role
from app.schemas.response.dashboard import DashboardStatsResponse
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get(
    "/stats",
    response_model=DashboardStatsResponse,
    dependencies=[Depends(require_role("admin", "super_admin"))],
)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
) -> DashboardStatsResponse:
    """Get admin dashboard statistics. Requires: roles:read"""
    service = DashboardService(db)
    return await service.get_stats()
