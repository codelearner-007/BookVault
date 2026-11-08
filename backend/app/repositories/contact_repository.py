"""Contact repository: the customers and suppliers tables (same shape)."""

from typing import Type

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.supplier import Supplier

ContactModel = Type[Customer] | Type[Supplier]


class ContactRepository:
    def __init__(self, session: AsyncSession, model: ContactModel) -> None:
        self.session = session
        self.model = model

    def _scoped(self, query, business_id: str, search: str | None):
        m = self.model
        query = query.where(m.business_id == business_id)
        if search:
            pattern = f"%{search}%"
            query = query.where(or_(m.name.ilike(pattern), m.code.ilike(pattern), m.email.ilike(pattern)))
        return query

    async def list_page(
        self, business_id: str, search: str | None, offset: int, limit: int
    ) -> tuple[list, int]:
        m = self.model
        total = (
            await self.session.execute(
                self._scoped(select(func.count()).select_from(m), business_id, search)
            )
        ).scalar_one()
        result = await self.session.execute(
            self._scoped(select(m), business_id, search)
            .order_by(m.created_at.asc(), m.id.asc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all()), total

    async def get(self, business_id: str, contact_id: str):
        result = await self.session.execute(
            select(self.model).where(
                self.model.business_id == business_id, self.model.id == contact_id
            )
        )
        return result.scalar_one_or_none()

    async def add(self, contact) -> None:
        self.session.add(contact)
        await self.session.flush()
        await self.session.refresh(contact)

    async def save(self, contact) -> None:
        await self.session.flush()
        await self.session.refresh(contact)

    async def delete(self, contact) -> None:
        await self.session.delete(contact)
        await self.session.flush()
