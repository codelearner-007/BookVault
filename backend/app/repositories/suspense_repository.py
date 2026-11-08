"""Suspense repository: the Suspense system account in the ledger (B3, NA-06)."""

from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

_BALANCE = text("SELECT public.suspense_balance(CAST(:business_id AS uuid))")
_ENTRIES = text("""
    SELECT CAST(document_id AS text) AS document_id, document_type, document_date AS date, reference,
           description, amount, total_count
    FROM public.suspense_entries(CAST(:business_id AS uuid), :offset, :limit)
""")


class SuspenseRepository:
    """SECURITY DEFINER aggregates: each checks suspense:view for the caller (B0.4)."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def balance(self, business_id: str) -> Decimal:
        return Decimal((await self.session.execute(_BALANCE, {"business_id": business_id})).scalar() or 0)

    async def entries_page(self, business_id: str, offset: int, limit: int) -> tuple[list[Row], int]:
        rows = (await self.session.execute(
            _ENTRIES, {"business_id": business_id, "offset": offset, "limit": limit})).all()
        return list(rows), (rows[0].total_count if rows else 0)
