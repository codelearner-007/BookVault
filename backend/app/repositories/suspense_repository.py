"""Suspense repository: receipt lines posted to the suspense placeholder account."""

from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_SUSPENSE_LINES = """
    FROM public.receipts r,
         jsonb_array_elements(r.lines) WITH ORDINALITY AS line_entry(line, ordinality)
    WHERE r.business_id = CAST(:business_id AS uuid) AND line->>'account_id' = 'suspense'
"""


class SuspenseRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def balance(self, business_id: str) -> Decimal:
        # SECURITY DEFINER function; it checks suspense:view for the caller (B0.4).
        result = await self.session.execute(
            text("SELECT public.business_suspense_balance_for(CAST(:business_id AS uuid))"),
            {"business_id": business_id},
        )
        return Decimal(result.scalar() or 0)

    async def entries_page(self, business_id: str, offset: int, limit: int) -> tuple[list[dict], int]:
        params = {"business_id": business_id, "offset": offset, "limit": limit}
        total = (await self.session.execute(text(f"SELECT count(*) {_SUSPENSE_LINES}"), params)).scalar_one()
        result = await self.session.execute(
            text(
                "SELECT r.id::text AS receipt_id, r.date AS receipt_date,"
                " r.reference AS receipt_reference, r.paid_by_other,"
                " r.paid_by_contact_id::text AS paid_by_contact_id, r.paid_by_contact_type,"
                " (line->>'amount')::numeric AS amount, (line_entry).ordinality - 1 AS line_index"
                f" {_SUSPENSE_LINES}"
                " ORDER BY r.date DESC, r.created_at DESC, r.id DESC, line_index"
                " OFFSET :offset LIMIT :limit"
            ),
            params,
        )
        return [dict(row) for row in result.mappings().all()], total
