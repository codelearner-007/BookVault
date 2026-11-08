"""Bank account service — business logic layer for the bank accounts feature."""

from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.bank_account_repository import BankAccountRepository
from app.repositories.coa_repository import CoaRepository
from app.schemas.response.bank_account import BankAccountListResponse, BankAccountResponse


class BankAccountService:
    """Service containing all business logic for bank account management."""

    def __init__(self, session: AsyncSession) -> None:
        self.repo = BankAccountRepository(session)
        self.coa_repo = CoaRepository(session)

    async def list_accounts(self, business_id: str) -> BankAccountListResponse:
        """Return all bank accounts for the business owned by owner_id."""
        items = await self.repo.list_by_business(business_id)
        coa_total = sum((a.current_balance or Decimal("0")) for a in items)
        return BankAccountListResponse(
            items=[BankAccountResponse.model_validate(a) for a in items],
            total=len(items),
            coa_total=coa_total,
        )

    async def get_account(
        self, business_id: str, bank_account_id: str
    ) -> BankAccountResponse:
        """Return a single bank account, raising 404 if not found or business not owned."""
        account = await self.repo.get(business_id, bank_account_id)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bank account not found",
            )
        return BankAccountResponse.model_validate(account)

    # (name, account_type, group_name, group_panel_type, group_sort_order)
    _SYSTEM_ACCOUNTS: list[tuple[str, str, str, str, int]] = [
        ("Cash and Cash Equivalents", "asset",  "Assets", "balance_sheet", 0),
        ("Inter Account Transfers",   "equity", "Equity", "balance_sheet", 2),
    ]

    async def _ensure_cash_system_accounts(self, business_id: str) -> None:
        """Auto-create system COA accounts on the first bank/cash account for the business.

        If the required COA group (Assets/Equity) does not yet exist for this business,
        it is created as a system group before the account is placed under it.
        """
        for name, acct_type, group_name, group_panel, group_sort in self._SYSTEM_ACCOUNTS:
            existing = await self.coa_repo.get_account_by_name(business_id, name)
            if existing:
                continue
            group = await self.coa_repo.get_group_by_name(business_id, group_name)
            if not group:
                group = await self.coa_repo.create_group(
                    business_id, group_name, group_panel, None,
                    is_system=True, sort_order=group_sort,
                )
            await self.coa_repo.create_account(
                business_id=business_id,
                name=name,
                type_=acct_type,
                group_id=group.id,
                is_system=True,
            )

    async def create_account(
        self,
        business_id: str,
        name: str,
        opening_balance: Decimal,
        description: str | None,
    ) -> BankAccountResponse:
        """Create a new bank account under the given business.

        On the first bank account for the business, auto-creates the
        'Cash and Cash Equivalents' and 'Inter Account Transfers' system COA accounts.
        """
        is_first = await self.repo.count_by_business(business_id) == 0
        account = await self.repo.create(
            business_id=business_id,
            name=name,
            opening_balance=opening_balance,
            description=description,
        )
        if is_first:
            await self._ensure_cash_system_accounts(business_id)
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
        deleted = await self.repo.delete(business_id, bank_account_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bank account not found",
            )
