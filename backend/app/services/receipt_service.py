"""Receipt service — business logic layer for the receipts feature."""

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.business_repository import BusinessRepository
from app.repositories.receipt_repository import ReceiptRepository
from app.schemas.response.receipt import ReceiptListResponse, ReceiptResponse


class ReceiptService:
    """Service containing all business logic for receipt management."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = ReceiptRepository(session)
        self.business_repo = BusinessRepository(session)

    async def _refresh_suspense(self) -> None:
        """Refresh the suspense balance materialized view."""
        await self.session.execute(
            text("REFRESH MATERIALIZED VIEW CONCURRENTLY public.business_suspense_balance")
        )

    async def _require_business(self, business_id: str) -> None:
        """Raise HTTP 404 if the business does not exist."""
        business = await self.business_repo.get(business_id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Business not found",
            )

    async def list_receipts(self, business_id: str) -> ReceiptListResponse:
        """Return all receipts for the business with resolved name fields."""
        await self._require_business(business_id)
        items = await self.repo.list_with_names(business_id)
        return ReceiptListResponse(
            items=[ReceiptResponse.model_validate(r) for r in items],
            total=len(items),
        )

    async def get_receipt(self, business_id: str, receipt_id: str) -> ReceiptResponse:
        """Return a single receipt with resolved name fields, raising 404 if not found."""
        await self._require_business(business_id)
        receipt = await self.repo.get_with_names(business_id, receipt_id)
        if not receipt:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Receipt not found",
            )
        return ReceiptResponse.model_validate(receipt)

    async def create_receipt(
        self,
        business_id: str,
        **fields: object,
    ) -> ReceiptResponse:
        """Create a new receipt under the given business."""
        await self._require_business(business_id)
        receipt = await self.repo.create(business_id=business_id, **fields)
        await self._refresh_suspense()
        return ReceiptResponse.model_validate(receipt)

    async def update_receipt(
        self,
        business_id: str,
        receipt_id: str,
        fields: dict[str, object],
    ) -> ReceiptResponse:
        """Update a receipt's fields, raising 404 if not found."""
        await self._require_business(business_id)
        updated = await self.repo.update(business_id, receipt_id, **fields)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Receipt not found",
            )
        await self._refresh_suspense()
        return ReceiptResponse.model_validate(updated)

    async def delete_receipt(self, business_id: str, receipt_id: str) -> None:
        """Delete a receipt, raising 404 if not found."""
        await self._require_business(business_id)
        deleted = await self.repo.delete(business_id, receipt_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Receipt not found",
            )
        await self._refresh_suspense()
