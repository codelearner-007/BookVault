"""Business repository: businesses and business_details."""

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.business_details import BusinessDetails


class BusinessRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_deleted_page(
        self, owner_id: str, offset: int, limit: int
    ) -> tuple[list[Business], int]:
        """Soft-deleted businesses (Trash) of the owner."""
        where = (Business.owner_id == owner_id, Business.deleted_at.is_not(None))
        total = (
            await self.session.execute(select(func.count()).select_from(Business).where(*where))
        ).scalar_one()
        result = await self.session.execute(
            select(Business).where(*where)
            .order_by(Business.deleted_at.desc(), Business.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all()), total

    async def get_by_owner(
        self, business_id: str, owner_id: str, include_deleted: bool = False
    ) -> Business | None:
        """The owner's business; soft-deleted ones only if include_deleted."""
        query = select(Business).where(Business.id == business_id, Business.owner_id == owner_id)
        if not include_deleted:
            query = query.where(Business.deleted_at.is_(None))
        return (await self.session.execute(query)).scalar_one_or_none()

    async def count_all_by_owner(self, owner_id: str) -> int:
        """How many businesses (active or soft-deleted) the user owns; caller is self or super admin.

        A SECURITY DEFINER function, because the platform path has no tenant row access (D-14).
        """
        result = await self.session.execute(
            text("SELECT public.count_owned_businesses(CAST(:owner_id AS uuid), true)"),
            {"owner_id": owner_id},
        )
        return int(result.scalar() or 0)

    async def add(self, business: Business) -> None:
        self.session.add(business)
        await self.session.flush()
        await self.session.refresh(business)

    async def save(self, business: Business) -> None:
        await self.session.flush()
        await self.session.refresh(business)

    async def delete(self, business: Business) -> None:
        await self.session.delete(business)
        await self.session.flush()

    async def get_details(self, business_id: str) -> BusinessDetails | None:
        result = await self.session.execute(
            select(BusinessDetails).where(BusinessDetails.business_id == business_id)
        )
        return result.scalar_one_or_none()

    async def upsert_details(self, business_id: str, address: str | None) -> BusinessDetails:
        details = await self.get_details(business_id)
        if details is None:
            details = BusinessDetails(business_id=business_id, address=address)
            self.session.add(details)
        else:
            details.address = address
        await self.session.flush()
        return details
