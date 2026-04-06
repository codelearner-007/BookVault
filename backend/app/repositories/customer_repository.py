"""Customer repository — data access layer for the customers table."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.repositories.base_repository import BaseRepository


class CustomerRepository(BaseRepository[Customer]):
    """Repository for Customer CRUD and query operations."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Customer, session)

    async def list_by_business(self, business_id: str) -> list[Customer]:
        """Return all customers for the given business, ordered by created_at asc."""
        result = await self.session.execute(
            select(Customer)
            .where(Customer.business_id == business_id)
            .order_by(Customer.created_at.asc())
        )
        return list(result.scalars().all())

    async def get(self, business_id: str, customer_id: str) -> Customer | None:
        """Return a single customer matching both business_id and customer_id."""
        result = await self.session.execute(
            select(Customer).where(
                Customer.business_id == business_id,
                Customer.id == customer_id,
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        business_id: str,
        name: str,
        code: str | None,
        billing_address: str | None,
        delivery_address: str | None,
        email: str | None,
    ) -> Customer:
        """Insert a new customer and return the persisted instance."""
        customer = Customer(
            business_id=business_id,
            name=name,
            code=code,
            billing_address=billing_address,
            delivery_address=delivery_address,
            email=email,
        )
        self.session.add(customer)
        await self.session.flush()
        await self.session.refresh(customer)
        return customer

    async def update(
        self,
        business_id: str,
        customer_id: str,
        **fields: object,
    ) -> Customer | None:
        """Update mutable fields on a customer. Returns None if not found.

        Only fields present in `fields` are applied. Passing a key with
        value None explicitly clears that field.
        """
        customer = await self.get(business_id, customer_id)
        if customer is None:
            return None
        for key, value in fields.items():
            setattr(customer, key, value)
        await self.session.flush()
        await self.session.refresh(customer)
        return customer

    async def delete(self, business_id: str, customer_id: str) -> bool:
        """Delete a customer. Returns True if deleted, False if not found."""
        customer = await self.get(business_id, customer_id)
        if customer is None:
            return False
        await self.session.delete(customer)
        await self.session.flush()
        return True
