"""Bank account repository: bank_accounts rows and their ledger aggregates (B3).

Balances and transactions come from SECURITY DEFINER aggregates that check the caller's
bank_cash_accounts view right (B0.4 rule), never from a stored balance.
"""

from datetime import date

from sqlalchemy import func, select, text
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bank_account import BankAccount

_BALANCES = text("""
    SELECT CAST(bank_account_id AS text) AS bank_account_id, actual, pending_deposits, pending_withdrawals
    FROM public.bank_account_balances(CAST(:business_id AS uuid))
""")
_TRANSACTIONS = text("""
    SELECT CAST(document_id AS text) AS document_id, document_type, document_date AS date, reference,
           description, counterparty, amount, balance, is_pending, total_count
    FROM public.bank_account_transactions(CAST(:business_id AS uuid), CAST(:bank_account_id AS uuid),
                                          CAST(:date_from AS date), CAST(:date_to AS date), :offset, :limit)
""")
_USAGE = text("""
    SELECT in_use, has_clears_later
    FROM public.bank_account_usage(CAST(:business_id AS uuid), CAST(:bank_account_id AS uuid))
""")


class BankAccountRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _live(business_id: str, include_inactive: bool = True):
        query = select(BankAccount).where(BankAccount.business_id == business_id, BankAccount.deleted_at.is_(None))
        return query if include_inactive else query.where(BankAccount.is_inactive.is_(False))

    async def list_page(
        self, business_id: str, offset: int, limit: int, include_inactive: bool = True
    ) -> tuple[list[BankAccount], int]:
        query = self._live(business_id, include_inactive)
        total = (await self.session.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
        rows = await self.session.execute(
            query.order_by(BankAccount.name.asc(), BankAccount.id.asc()).offset(offset).limit(limit)
        )
        return list(rows.scalars().all()), total

    async def get(self, business_id: str, bank_account_id: str, *, for_update: bool = False) -> BankAccount | None:
        query = self._live(business_id).where(BankAccount.id == bank_account_id)
        if for_update:
            query = query.with_for_update()
        return (await self.session.execute(query)).scalar_one_or_none()

    async def balances(self, business_id: str) -> dict[str, Row]:
        rows = (await self.session.execute(_BALANCES, {"business_id": business_id})).all()
        return {r.bank_account_id: r for r in rows}

    async def transactions_page(
        self, business_id: str, bank_account_id: str, date_from: date | None, date_to: date | None,
        offset: int, limit: int,
    ) -> tuple[list[Row], int]:
        rows = (await self.session.execute(_TRANSACTIONS, {
            "business_id": business_id, "bank_account_id": bank_account_id, "date_from": date_from,
            "date_to": date_to, "offset": offset, "limit": limit,
        })).all()
        return list(rows), (rows[0].total_count if rows else 0)

    async def usage(self, business_id: str, bank_account_id: str) -> Row:
        return (await self.session.execute(
            _USAGE, {"business_id": business_id, "bank_account_id": bank_account_id})).one()

    async def add(self, account: BankAccount) -> None:
        self.session.add(account)
        await self.session.flush()
        await self.session.refresh(account)

    async def save(self, account: BankAccount) -> None:
        await self.session.flush()
        await self.session.refresh(account)
