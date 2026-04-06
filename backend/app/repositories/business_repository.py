"""Business repository — data access layer for the businesses table."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_tab import AdminTab
from app.models.business import Business
from app.models.business_tab import BusinessTab
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

    async def get_by_owner(self, business_id: str, owner_id: str) -> Business | None:
        """Return a business only if it belongs to the given owner, None otherwise."""
        result = await self.session.execute(
            select(Business).where(
                Business.id == business_id,
                Business.owner_id == owner_id,
            )
        )
        return result.scalar_one_or_none()

    async def hard_delete(self, business_id: str, owner_id: str) -> None:
        """Permanently delete a business from the database if it belongs to the given owner."""
        result = await self.session.execute(
            select(Business).where(
                Business.id == business_id,
                Business.owner_id == owner_id,
            )
        )
        business = result.scalar_one_or_none()
        if business:
            await self.delete(business)

    async def list_admin_tabs(self) -> list[AdminTab]:
        """Return all admin tabs ordered by order_index then id."""
        result = await self.session.execute(
            select(AdminTab).order_by(AdminTab.order_index.asc(), AdminTab.id.asc())
        )
        return list(result.scalars().all())

    async def get_admin_tab_by_key(self, key: str) -> AdminTab | None:
        """Return a single admin tab by its unique key."""
        result = await self.session.execute(
            select(AdminTab).where(AdminTab.key == key)
        )
        return result.scalar_one_or_none()

    async def list_business_tabs(self, business_id: str) -> list[BusinessTab]:
        """Return all tabs for a specific business ordered by order_index then id."""
        result = await self.session.execute(
            select(BusinessTab)
            .where(BusinessTab.business_id == business_id)
            .order_by(BusinessTab.order_index.asc(), BusinessTab.id.asc())
        )
        return list(result.scalars().all())

    async def get_business_tab_by_key(self, business_id: str, key: str) -> BusinessTab | None:
        """Return a single business tab matching both business_id and key."""
        result = await self.session.execute(
            select(BusinessTab).where(
                BusinessTab.business_id == business_id,
                BusinessTab.key == key,
            )
        )
        return result.scalar_one_or_none()
