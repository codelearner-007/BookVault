"""Permission service with business logic."""

from typing import Dict, List

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.permission import Permission
from app.repositories.permission_repository import PermissionRepository


class PermissionService:
    """Service for permission management."""

    def __init__(self, session: AsyncSession):
        self.repository = PermissionRepository(session)

    async def list_grouped_by_module(self) -> Dict[str, List[Permission]]:
        """List permissions grouped by module."""
        return await self.repository.list_grouped_by_module()
