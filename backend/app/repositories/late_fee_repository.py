"""Late payment fees repository: the typed extension and its reads (B4, PR-31).

The fee's customer is its invoice's customer (trade_documents.party_id; no copy, 3NF).
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sales import LatePaymentFee

_ROWS = """
    FROM public.late_payment_fees f
    JOIN public.documents d ON d.business_id = f.business_id AND d.id = f.document_id
    JOIN public.document_statuses s ON s.id = d.status_id
    LEFT JOIN public.trade_documents td ON td.business_id = f.business_id AND td.document_id = f.invoice_document_id
    LEFT JOIN public.documents inv ON inv.business_id = f.business_id AND inv.id = f.invoice_document_id
    LEFT JOIN public.customers cu ON cu.business_id = f.business_id AND cu.id = td.party_id
    WHERE f.business_id = :business_id
"""
_COLUMNS = """
    SELECT CAST(d.id AS text) AS id, d.reference, d.document_date AS date, CAST(td.party_id AS text) AS customer_id,
           cu.name AS customer_name, CAST(f.invoice_document_id AS text) AS invoice_id,
           inv.reference AS invoice_reference, f.amount, d.description, s.key AS status, d.version
"""
_PAGE = text(f"{_COLUMNS} {_ROWS} ORDER BY d.document_date DESC, d.id DESC OFFSET :offset LIMIT :limit")
_TOTALS = text(f"""SELECT count(*) AS total, COALESCE(sum(f.amount) FILTER (WHERE s.key = 'posted'), 0) AS amount
                   {_ROWS}""")
_ONE = text(f"{_COLUMNS} {_ROWS} AND f.document_id = :document_id")
_CHARGED = text("""
    SELECT CAST(f.invoice_document_id AS text) AS invoice_id, d.document_date
    FROM public.late_payment_fees f
    JOIN public.documents d ON d.business_id = f.business_id AND d.id = f.document_id
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key <> 'void'
    WHERE f.business_id = :business_id
""")


class LateFeeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, business_id: str, document_id: str) -> LatePaymentFee | None:
        return (await self.session.execute(select(LatePaymentFee).where(
            LatePaymentFee.business_id == business_id, LatePaymentFee.document_id == document_id,
        ))).scalar_one_or_none()

    async def add(self, row: LatePaymentFee) -> None:
        self.session.add(row)
        await self.session.flush()

    async def save(self) -> None:
        await self.session.flush()

    async def list_page(self, business_id: str, offset: int, limit: int) -> tuple[list[Row], int, Decimal]:
        totals = (await self.session.execute(_TOTALS, {"business_id": business_id})).one()
        rows = await self.session.execute(_PAGE, {"business_id": business_id, "offset": offset, "limit": limit})
        return list(rows.all()), totals.total, totals.amount

    async def detail(self, business_id: str, document_id: str) -> Row:
        return (await self.session.execute(_ONE, {"business_id": business_id, "document_id": document_id})).one()

    async def charged_dates(self, business_id: str) -> set[tuple[str, date]]:
        rows = await self.session.execute(_CHARGED, {"business_id": business_id})
        return {(r.invoice_id, r.document_date) for r in rows}

