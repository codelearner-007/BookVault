"""System modules endpoints."""

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_role
from app.services.audit_service import AuditService

router = APIRouter(prefix="/modules", tags=["Modules"])


@router.get(
    "",
    response_model=List[str],
    dependencies=[Depends(require_role("admin", "super_admin"))],
)
async def list_modules(
    db: AsyncSession = Depends(get_db),
) -> List[str]:
    """Get list of all distinct module names from audit logs. Requires: audit:read"""
    service = AuditService(db)
    return await service.list_distinct_modules()
