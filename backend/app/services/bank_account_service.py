"""Bank account service — business logic layer for the bank accounts feature."""

from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.bank_account_repository import BankAccountRepository
from app.repositories.business_repository import BusinessRepository
from app.schemas.response.bank_account import BankAccountListResponse, BankAccountResponse


class BankAccountService:
    """Service containing all business logic for bank account management."""

    def __init__(self, session: AsyncSession) -> None:
        self.repo = BankAccountRepository(session)
        self.business_repo = BusinessRepository(session)

    async def _require_business(self, business_id: str) -> None:
        """Raise HTTP 404 if the business does not exist."""
        business = await self.business_repo.get(business_id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Business not found",
            )

    async def list_accounts(self, business_id: str) -> BankAccountListResponse:
        """Return all bank accounts for the business owned by owner_id."""
        await self._require_business(business_id)
        items = await self.repo.list_by_business(business_id)
        total = await self.repo.get_total(business_id)
        return BankAccountListResponse(
            items=[BankAccountResponse.model_validate(a) for a in items],
            total=len(items),
            coa_total=total,
        )

    async def get_account(
        self, business_id: str, bank_account_id: str
    ) -> BankAccountResponse:
        """Return a single bank account, raising 404 if not found or business not owned."""
        await self._require_business(business_id)
        account = await self.repo.get(business_id, bank_account_id)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bank account not found",
            )
        return BankAccountResponse.model_validate(account)

    async def create_account(
        self,
        business_id: str,
        name: str,
        opening_balance: Decimal,
        description: str | None,
    ) -> BankAccountResponse:
        """Create a new bank account under the given business."""
        await self._require_business(business_id)
        account = await self.repo.create(
            business_id=business_id,
            name=name,
            opening_balance=opening_balance,
            description=description,
        )
        return BankAccountResponse.model_validate(account)

    async def update_account(
        self,
        business_id: str,
        bank_account_id: str,
        name: str | None,
        description: str | None,
        update_description: bool,
    ) -> BankAccountResponse:
        """Update a bank account's name and/or description, raising 404 if not found."""
        await self._require_business(business_id)
        updated = await self.repo.update(
            business_id=business_id,
            bank_account_id=bank_account_id,
            name=name,
            description=description,
            update_description=update_description,
        )
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bank account not found",
            )
        return BankAccountResponse.model_validate(updated)

    async def delete_account(
        self, business_id: str, bank_account_id: str
    ) -> None:
        """Delete a bank account, raising 404 if not found."""
        await self._require_business(business_id)
        deleted = await self.repo.delete(business_id, bank_account_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bank account not found",
            )

    async def get_total(self, business_id: str) -> Decimal:
        """Return the SUM of current_balance for all bank accounts in the business."""
        await self._require_business(business_id)
        return await self.repo.get_total(business_id)
