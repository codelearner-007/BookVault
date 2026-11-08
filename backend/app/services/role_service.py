"""Role service with business logic."""

from typing import List

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundError
from app.models.role import Role
from app.repositories.role_repository import RoleRepository


class RoleService:
    """Service for role management."""

    def __init__(self, session: AsyncSession):
        self.repository = RoleRepository(session)

    async def list_roles(self) -> List[Role]:
        """List all roles."""
        return await self.repository.list()

    async def get_role_with_permissions(self, role_id: str) -> Role:
        """
        Get role with permissions.

        Args:
            role_id: Role ID

        Returns:
            Role instance with permissions

        Raises:
            ResourceNotFoundError: If role not found
        """
        role = await self.repository.get_with_permissions(role_id)
        if not role:
            raise ResourceNotFoundError("Role", role_id)
        return role
