"""Bank account repository: the bank_accounts table."""

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bank_account import BankAccount


class BankAccountRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_page(
        self, business_id: str, offset: int, limit: int
    ) -> tuple[list[BankAccount], int, Decimal]:
        """A page of accounts, the account count and the sum of all current balances."""
        total, balance = (
            await self.session.execute(
                select(func.count(), func.coalesce(func.sum(BankAccount.current_balance), 0))
                .where(BankAccount.business_id == business_id)
            )
        ).one()
        result = await self.session.execute(
            select(BankAccount)
            .where(BankAccount.business_id == business_id)
            .order_by(BankAccount.created_at.asc(), BankAccount.id.asc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all()), total, Decimal(balance)

    async def get(self, business_id: str, bank_account_id: str) -> BankAccount | None:
        result = await self.session.execute(
            select(BankAccount).where(
                BankAccount.business_id == business_id, BankAccount.id == bank_account_id
            )
        )
        return result.scalar_one_or_none()

    async def add(self, account: BankAccount) -> None:
        self.session.add(account)
        await self.session.flush()
        await self.session.refresh(account)

    async def save(self, account: BankAccount) -> None:
        await self.session.flush()
        await self.session.refresh(account)

    async def delete(self, account: BankAccount) -> None:
        await self.session.delete(account)
        await self.session.flush()
