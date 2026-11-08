"""Receipt service — business logic layer for the receipts feature."""

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.core.ids import is_uuid
from app.repositories.bank_account_repository import BankAccountRepository
from app.repositories.coa_repository import CoaRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.receipt_repository import ReceiptRepository
from app.repositories.supplier_repository import SupplierRepository
from app.schemas.response.receipt import ReceiptListResponse, ReceiptResponse

SUSPENSE_ACCOUNT_KEY = "suspense"


class ReceiptService:
    """Service containing all business logic for receipt management."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = ReceiptRepository(session)
        self.bank_account_repo = BankAccountRepository(session)
        self.coa_repo = CoaRepository(session)
        self.contact_repos = {
            "customer": CustomerRepository(session),
            "supplier": SupplierRepository(session),
        }

    async def _refresh_suspense(self) -> None:
        """Refresh the suspense balance materialized view."""
        await self.session.execute(
            text("REFRESH MATERIALIZED VIEW CONCURRENTLY private.business_suspense_balance")
        )

    async def _validate_references(self, business_id: str, fields: dict[str, object]) -> None:
        """Reject ids that are not records of this business (CS-05, AC-02)."""
        account_id = fields.get("received_in_account_id")
        if account_id and not (
            is_uuid(account_id) and await self.bank_account_repo.get(business_id, account_id)
        ):
            raise ValidationError(
                "Received-in account not found in this business", "received_in_account_id"
            )

        contact_id = fields.get("paid_by_contact_id")
        if contact_id:
            contact_repo = self.contact_repos.get(fields.get("paid_by_contact_type"))
            if not (
                contact_repo
                and is_uuid(contact_id)
                and await contact_repo.get(business_id, contact_id)
            ):
                raise ValidationError("Contact not found in this business", "paid_by_contact_id")

        line_account_ids = {
            line["account_id"]
            for line in fields.get("lines") or []
            if line["account_id"] != SUSPENSE_ACCOUNT_KEY
        }
        if not line_account_ids:
            return
        if not all(is_uuid(a) for a in line_account_ids) or (
            await self.coa_repo.existing_account_ids(business_id, line_account_ids)
            != line_account_ids
        ):
            raise ValidationError("Line account not found in this business", "lines")

    async def list_receipts(self, business_id: str) -> ReceiptListResponse:
        """Return all receipts for the business with resolved name fields."""
        items = await self.repo.list_with_names(business_id)
        return ReceiptListResponse(
            items=[ReceiptResponse.model_validate(r) for r in items],
            total=len(items),
        )

    async def get_receipt(self, business_id: str, receipt_id: str) -> ReceiptResponse:
        """Return a single receipt with resolved name fields, raising 404 if not found."""
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
        await self._validate_references(business_id, fields)
        receipt = await self.repo.create(business_id=business_id, **fields)
        await self._refresh_suspense()
        account_id = receipt.received_in_account_id
        if account_id:
            await self.bank_account_repo.recalculate_balance(business_id, account_id)
        enriched = await self.repo.get_with_names(business_id, receipt.id)
        return ReceiptResponse.model_validate(enriched)

    async def update_receipt(
        self,
        business_id: str,
        receipt_id: str,
        fields: dict[str, object],
    ) -> ReceiptResponse:
        """Update a receipt's fields, raising 404 if not found."""
        existing = await self.repo.get(business_id, receipt_id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Receipt not found",
            )
        await self._validate_references(
            business_id,
            {
                "paid_by_contact_id": existing.paid_by_contact_id,
                "paid_by_contact_type": existing.paid_by_contact_type,
                **fields,
            },
        )
        old_account_id = existing.received_in_account_id
        updated = await self.repo.update(business_id, receipt_id, **fields)
        await self._refresh_suspense()
        new_account_id = updated.received_in_account_id
        accounts_to_recalculate = {a for a in (old_account_id, new_account_id) if a}
        for account_id in accounts_to_recalculate:
            await self.bank_account_repo.recalculate_balance(business_id, account_id)
        enriched = await self.repo.get_with_names(business_id, receipt_id)
        return ReceiptResponse.model_validate(enriched)

    async def delete_receipt(self, business_id: str, receipt_id: str) -> None:
        """Delete a receipt, raising 404 if not found."""
        existing = await self.repo.get(business_id, receipt_id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Receipt not found",
            )
        account_id = existing.received_in_account_id
        await self.repo.delete(business_id, receipt_id)
        await self._refresh_suspense()
        if account_id:
            await self.bank_account_repo.recalculate_balance(business_id, account_id)
