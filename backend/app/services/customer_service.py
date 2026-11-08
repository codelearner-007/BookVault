"""Customer service — business logic layer for the customers feature."""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.customer_repository import CustomerRepository
from app.schemas.response.customer import CustomerListResponse, CustomerResponse
from app.schemas.response.receipt import ReceiptListResponse, ReceiptResponse


class CustomerService:
    """Service containing all business logic for customer management."""

    def __init__(self, session: AsyncSession) -> None:
        self.repo = CustomerRepository(session)

    async def list_customers(self, business_id: str) -> CustomerListResponse:
        """Return all customers for the business."""
        items = await self.repo.list_by_business(business_id)
        return CustomerListResponse(
            items=[CustomerResponse.model_validate(c) for c in items],
            total=len(items),
        )

    async def get_customer(
        self, business_id: str, customer_id: str
    ) -> CustomerResponse:
        """Return a single customer, raising 404 if not found."""
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
        updated = await self.repo.update(business_id, customer_id, **fields)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Customer not found",
            )
        return CustomerResponse.model_validate(updated)

    async def delete_customer(self, business_id: str, customer_id: str) -> None:
        """Delete a customer, raising 404 if not found."""
        deleted = await self.repo.delete(business_id, customer_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Customer not found",
            )

    async def list_customer_receipts(
        self, business_id: str, customer_id: str
    ) -> ReceiptListResponse:
        """Return all receipts for a specific customer."""
        customer = await self.repo.get(business_id, customer_id)
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Customer not found",
            )
        receipts = await self.repo.list_receipts(business_id, customer_id)
        return ReceiptListResponse(
            items=[ReceiptResponse.model_validate(r) for r in receipts],
            total=len(receipts),
        )
