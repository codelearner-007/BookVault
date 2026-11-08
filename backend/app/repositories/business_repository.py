"""Business repository: businesses and business_details."""

from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.business_details import BusinessDetails


# How the business writes dates and amounts (business_format; unset parts fall back to its country's
# template, then the generic one) and its base currency (business_currencies).
_FORMAT = text("""
    SELECT COALESCE(f.date_format, t.date_format) AS date_format,
           COALESCE(f.number_format, t.number_format) AS number_format,
           cur.code AS currency_code, cur.decimal_places
    FROM public.businesses b
    LEFT JOIN public.business_format f ON f.business_id = b.id
    LEFT JOIN public.business_currencies bc ON bc.business_id = b.id AND bc.is_base
    LEFT JOIN public.currencies cur ON cur.id = bc.currency_id
    LEFT JOIN LATERAL (
        SELECT ct.date_format, ct.number_format FROM public.country_templates ct
        WHERE ct.country_id = b.country_id OR ct.country_id IS NULL
        ORDER BY ct.country_id NULLS LAST LIMIT 1
    ) t ON true
    WHERE b.id = CAST(:id AS uuid)
""")


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

    async def export(self, business_id: str) -> dict[str, list[dict[str, Any]]]:
        """Every business-scoped row by table (SECURITY DEFINER; caller must own the business)."""
        result = await self.session.execute(
            text("SELECT public.export_business(CAST(:id AS uuid))"), {"id": business_id}
        )
        return result.scalar_one()

    async def purge(
        self, business_id: str, actor_id: str, confirmation: str, request_id: str | None
    ) -> dict[str, int]:
        """Permanently delete the business through the audited purge function (B0.8)."""
        result = await self.session.execute(
            text(
                "SELECT public.purge_business(CAST(:id AS uuid), CAST(:actor AS uuid),"
                " :confirmation, :request_id)"
            ),
            {"id": business_id, "actor": actor_id, "confirmation": confirmation,
             "request_id": request_id},
        )
        self.session.expunge_all()
        return result.scalar_one()

    async def get_details(self, business_id: str) -> BusinessDetails | None:
        result = await self.session.execute(
            select(BusinessDetails).where(BusinessDetails.business_id == business_id)
        )
        return result.scalar_one_or_none()

    async def get_format(self, business_id: str) -> dict[str, Any] | None:
        """The business's date and number format plus its base currency's code and decimal places."""
        result = await self.session.execute(_FORMAT, {"id": business_id})
        row = result.mappings().one_or_none()
        return dict(row) if row else None

    async def upsert_details(self, business_id: str, address: str | None) -> BusinessDetails:
        details = await self.get_details(business_id)
        if details is None:
            details = BusinessDetails(business_id=business_id, address=address)
            self.session.add(details)
        else:
            details.address = address
        await self.session.flush()
        return details
