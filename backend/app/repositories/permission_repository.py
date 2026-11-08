"""Permission repository."""

from typing import Dict, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.permission import Permission
from app.repositories.base_repository import BaseRepository


class PermissionRepository(BaseRepository[Permission]):
    """Repository for Permission model."""

    def __init__(self, session: AsyncSession):
        super().__init__(Permission, session)

    async def list_grouped_by_module(self) -> Dict[str, List[Permission]]:
        """
        List all permissions grouped by module.

        Returns:
            Dictionary mapping module name to list of permissions
        """
        result = await self.session.execute(
            select(Permission).order_by(Permission.module, Permission.action)
        )
        permissions = result.scalars().all()

        grouped: Dict[str, List[Permission]] = {}
        for perm in permissions:
            if perm.module not in grouped:
                grouped[perm.module] = []
            grouped[perm.module].append(perm)

        return grouped
