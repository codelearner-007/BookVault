"""Supplier service — business logic layer for the suppliers feature."""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.supplier_repository import SupplierRepository
from app.schemas.response.receipt import ReceiptListResponse, ReceiptResponse
from app.schemas.response.supplier import SupplierListResponse, SupplierResponse


class SupplierService:
    """Service containing all business logic for supplier management."""

    def __init__(self, session: AsyncSession) -> None:
        self.repo = SupplierRepository(session)

    async def list_suppliers(self, business_id: str) -> SupplierListResponse:
        """Return all suppliers for the business."""
        items = await self.repo.list_by_business(business_id)
        return SupplierListResponse(
            items=[SupplierResponse.model_validate(s) for s in items],
            total=len(items),
        )

    async def get_supplier(
        self, business_id: str, supplier_id: str
    ) -> SupplierResponse:
        """Return a single supplier, raising 404 if not found."""
        supplier = await self.repo.get(business_id, supplier_id)
        if not supplier:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Supplier not found",
            )
        return SupplierResponse.model_validate(supplier)

    async def create_supplier(
        self,
        business_id: str,
        name: str,
        code: str | None,
        billing_address: str | None,
        delivery_address: str | None,
        email: str | None,
    ) -> SupplierResponse:
        """Create a new supplier under the given business."""
        supplier = await self.repo.create(
            business_id=business_id,
            name=name,
            code=code,
            billing_address=billing_address,
            delivery_address=delivery_address,
            email=email,
        )
        return SupplierResponse.model_validate(supplier)

    async def update_supplier(
        self,
        business_id: str,
        supplier_id: str,
        fields: dict[str, object],
    ) -> SupplierResponse:
        """Update a supplier's fields, raising 404 if not found."""
        updated = await self.repo.update(business_id, supplier_id, **fields)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Supplier not found",
            )
        return SupplierResponse.model_validate(updated)

    async def delete_supplier(self, business_id: str, supplier_id: str) -> None:
        """Delete a supplier, raising 404 if not found."""
        deleted = await self.repo.delete(business_id, supplier_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Supplier not found",
            )

    async def list_supplier_receipts(
        self, business_id: str, supplier_id: str
    ) -> ReceiptListResponse:
        """Return all receipts for a specific supplier."""
        supplier = await self.repo.get(business_id, supplier_id)
        if not supplier:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Supplier not found",
            )
        receipts = await self.repo.list_receipts(business_id, supplier_id)
        return ReceiptListResponse(
            items=[ReceiptResponse.model_validate(r) for r in receipts],
            total=len(receipts),
        )
