"""Customer service — business logic layer for the customers feature."""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.business_repository import BusinessRepository
from app.repositories.customer_repository import CustomerRepository
from app.schemas.response.customer import CustomerListResponse, CustomerResponse


class CustomerService:
    """Service containing all business logic for customer management."""

    def __init__(self, session: AsyncSession) -> None:
        self.repo = CustomerRepository(session)
        self.business_repo = BusinessRepository(session)

    async def _require_business(self, business_id: str) -> None:
        """Raise HTTP 404 if the business does not exist."""
        business = await self.business_repo.get(business_id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Business not found",
            )

    async def list_customers(self, business_id: str) -> CustomerListResponse:
        """Return all customers for the business."""
        await self._require_business(business_id)
        items = await self.repo.list_by_business(business_id)
        return CustomerListResponse(
            items=[CustomerResponse.model_validate(c) for c in items],
            total=len(items),
        )

    async def get_customer(
        self, business_id: str, customer_id: str
    ) -> CustomerResponse:
        """Return a single customer, raising 404 if not found."""
        await self._require_business(business_id)
        customer = await self.repo.get(business_id, customer_id)
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Customer not found",
            )
        return CustomerResponse.model_validate(customer)

    async def create_customer(
        self,
        business_id: str,
        name: str,
        code: str | None,
        billing_address: str | None,
        delivery_address: str | None,
        email: str | None,
    ) -> CustomerResponse:
        """Create a new customer under the given business."""
        await self._require_business(business_id)
        customer = await self.repo.create(
            business_id=business_id,
            name=name,
            code=code,
            billing_address=billing_address,
            delivery_address=delivery_address,
            email=email,
        )
        return CustomerResponse.model_validate(customer)

    async def update_customer(
        self,
        business_id: str,
        customer_id: str,
        fields: dict[str, object],
    ) -> CustomerResponse:
        """Update a customer's fields, raising 404 if not found."""
        await self._require_business(business_id)
        updated = await self.repo.update(business_id, customer_id, **fields)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Customer not found",
            )
        return CustomerResponse.model_validate(updated)

    async def delete_customer(self, business_id: str, customer_id: str) -> None:
        """Delete a customer, raising 404 if not found."""
        await self._require_business(business_id)
        deleted = await self.repo.delete(business_id, customer_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Customer not found",
            )
