"""Business settings repository: the book settings (books start date, lock date)."""

from datetime import date

from sqlalchemy import select, update
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business_settings import BusinessSettings


class BusinessSettingsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, business_id: str) -> BusinessSettings | None:
        result = await self.session.execute(
            select(BusinessSettings).where(BusinessSettings.business_id == business_id)
        )
        return result.scalar_one_or_none()

    async def update_books(
        self, business_id: str, version: int, books_start_date: date, lock_date: date | None
    ) -> Row | None:
        """UPDATE ... WHERE version = :v; None when the row changed meanwhile (optimistic lock)."""
        result = await self.session.execute(
            update(BusinessSettings)
            .where(BusinessSettings.business_id == business_id, BusinessSettings.version == version)
            .values(books_start_date=books_start_date, lock_date=lock_date, version=version + 1)
            .returning(BusinessSettings.books_start_date, BusinessSettings.lock_date, BusinessSettings.version)
            .execution_options(synchronize_session=False)
        )
        return result.one_or_none()
