"""Business repository — data access layer for the businesses table."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.repositories.base_repository import BaseRepository


class BusinessRepository(BaseRepository[Business]):
    """Repository for Business CRUD and query operations."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Business, session)

    async def list_by_owner(self, owner_id: str) -> list[Business]:
        """Return all active businesses owned by the given auth user."""
        result = await self.session.execute(
            select(Business)
            .where(Business.owner_id == owner_id, Business.deleted_at.is_(None))
            .order_by(Business.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_deleted_by_owner(self, owner_id: str) -> list[Business]:
        """Return all soft-deleted businesses owned by the given auth user."""
        result = await self.session.execute(
            select(Business)
            .where(Business.owner_id == owner_id, Business.deleted_at.is_not(None))
            .order_by(Business.deleted_at.desc())
        )
        return list(result.scalars().all())

    async def count_by_owner(self, owner_id: str) -> int:
        """Return total count of active businesses owned by the given auth user."""
        result = await self.session.execute(
            select(func.count()).select_from(Business).where(
                Business.owner_id == owner_id, Business.deleted_at.is_(None)
            )
        )
        return result.scalar_one()

    async def count_deleted_by_owner(self, owner_id: str) -> int:
        """Return total count of soft-deleted businesses owned by the given auth user."""
        result = await self.session.execute(
            select(func.count()).select_from(Business).where(
                Business.owner_id == owner_id, Business.deleted_at.is_not(None)
            )
        )
        return result.scalar_one()

    async def hard_delete(self, business_id: str) -> None:
        """Permanently delete a business from the database (including soft-deleted rows)."""
        result = await self.session.execute(
            select(Business).where(Business.id == business_id)
        )
        business = result.scalar_one_or_none()
        if business:
            await self.delete(business)
