"""Role repository."""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.role import Role
from app.models.role_permission import RolePermission
from app.repositories.base_repository import BaseRepository


class RoleRepository(BaseRepository[Role]):
    """Repository for Role model."""

    def __init__(self, session: AsyncSession):
        super().__init__(Role, session)

    async def get_with_permissions(self, role_id: str) -> Optional[Role]:
        """
        Get role with permissions eagerly loaded.

        Args:
            role_id: Role ID

        Returns:
            Role instance with permissions or None
        """
        result = await self.session.execute(
            select(Role)
            .where(Role.id == role_id)
            .options(selectinload(Role.role_permissions).selectinload(RolePermission.permission))
        )
        return result.scalar_one_or_none()
