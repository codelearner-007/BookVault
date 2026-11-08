"""Country reference repository."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.country import Country


class CountryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _filtered(self, query, search: str | None):
        if search:
            return query.where(Country.name.ilike(f"%{search}%"))
        return query

    async def list_page(self, search: str | None, offset: int, limit: int) -> tuple[list[Country], int]:
        total = (
            await self.session.execute(self._filtered(select(func.count()).select_from(Country), search))
        ).scalar_one()
        result = await self.session.execute(
            self._filtered(select(Country), search).order_by(Country.name).offset(offset).limit(limit)
        )
        return list(result.scalars().all()), total
