"""Bank account repository — data access layer for the bank_accounts table."""

from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bank_account import BankAccount
from app.repositories.base_repository import BaseRepository


class BankAccountRepository(BaseRepository[BankAccount]):
    """Repository for BankAccount CRUD and query operations."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(BankAccount, session)

    async def list_by_business(self, business_id: str) -> list[BankAccount]:
        """Return all bank accounts for the given business, ordered by created_at asc."""
        result = await self.session.execute(
            select(BankAccount)
            .where(BankAccount.business_id == business_id)
            .order_by(BankAccount.created_at.asc())
        )
        return list(result.scalars().all())

    async def get(self, business_id: str, bank_account_id: str) -> BankAccount | None:
        """Return a single bank account matching both business_id and bank_account_id."""
        result = await self.session.execute(
            select(BankAccount).where(
                BankAccount.business_id == business_id,
                BankAccount.id == bank_account_id,
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        business_id: str,
        name: str,
        opening_balance: Decimal,
        description: str | None,
    ) -> BankAccount:
        """Insert a new bank account and return the persisted instance.

        Sets current_balance equal to opening_balance at creation time.
        """
        account = BankAccount(
            business_id=business_id,
            name=name,
            opening_balance=opening_balance,
            current_balance=opening_balance,
            description=description,
        )
        self.session.add(account)
        await self.session.flush()
        await self.session.refresh(account)
        return account

    async def update(
        self,
        business_id: str,
        bank_account_id: str,
        name: str | None,
        description: str | None,
        update_description: bool,
    ) -> BankAccount | None:
        """Update mutable fields (name, description) on a bank account.

        Returns None if the account is not found.
        Balance changes are managed separately and not touched here.
        """
        account = await self.get(business_id, bank_account_id)
        if account is None:
            return None
        if name is not None:
            account.name = name
        if update_description:
            account.description = description
        await self.session.flush()
        await self.session.refresh(account)
        return account

    async def delete(self, business_id: str, bank_account_id: str) -> bool:
        """Delete a bank account. Returns True if deleted, False if not found."""
        account = await self.get(business_id, bank_account_id)
        if account is None:
            return False
        await self.session.delete(account)
        await self.session.flush()
        return True

    async def recalculate_balance(
        self, business_id: str, bank_account_id: str
    ) -> None:
        """Recompute current_balance from opening_balance + sum of all receipt line totals.

        Uses a raw SQL expression to aggregate the JSONB ``lines`` array totals from
        the receipts table.  This mirrors the DB trigger as a belt-and-suspenders
        safety net run after every receipt write.
        """
        await self.session.execute(
            text(
                """
                UPDATE bank_accounts
                SET current_balance = opening_balance + COALESCE((
                    SELECT SUM((line->>'total')::numeric)
                    FROM   receipts,
                           LATERAL jsonb_array_elements(lines) AS line
                    WHERE  receipts.received_in_account_id = :account_id
                    AND    receipts.business_id            = :business_id
                ), 0)
                WHERE id          = :account_id
                AND   business_id = :business_id
                """
            ),
            {"account_id": bank_account_id, "business_id": business_id},
        )
        await self.session.flush()
