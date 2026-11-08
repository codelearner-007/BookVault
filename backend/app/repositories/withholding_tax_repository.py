"""Withholding tax repository (B7): receipts (PR-36) and the WHT settings columns of business_settings."""

from decimal import Decimal

from sqlalchemy import select, text, update
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business_settings import BusinessSettings
from app.models.sales import WithholdingTaxReceipt

_ROWS = """
    FROM public.withholding_tax_receipts w
    JOIN public.documents d ON d.business_id = w.business_id AND d.id = w.document_id
    JOIN public.document_statuses s ON s.id = d.status_id
    LEFT JOIN public.customers cu ON cu.business_id = w.business_id AND cu.id = w.party_id
    WHERE w.business_id = :business_id
      AND (CAST(:party_id AS uuid) IS NULL OR w.party_id = CAST(:party_id AS uuid))
"""
_COLUMNS = """
    SELECT CAST(d.id AS text) AS id, d.reference, d.document_date AS date, CAST(w.party_id AS text) AS customer_id,
           cu.name AS customer_name, w.amount, d.description, s.key AS status, d.version
"""
_PAGE = text(f"{_COLUMNS} {_ROWS} ORDER BY d.document_date DESC, d.id DESC OFFSET :offset LIMIT :limit")
_TOTALS = text(f"""SELECT count(*) AS total, COALESCE(sum(w.amount) FILTER (WHERE s.key = 'posted'), 0) AS amount
                   {_ROWS}""")
_ONE = text(f"{_COLUMNS} {_ROWS} AND w.document_id = :document_id")


class WithholdingTaxRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, business_id: str, document_id: str) -> WithholdingTaxReceipt | None:
        return (await self.session.execute(select(WithholdingTaxReceipt).where(
            WithholdingTaxReceipt.business_id == business_id, WithholdingTaxReceipt.document_id == document_id,
        ))).scalar_one_or_none()

    async def add(self, row: WithholdingTaxReceipt) -> None:
        self.session.add(row)
        await self.session.flush()

    async def save(self) -> None:
        await self.session.flush()

    async def list_page(self, business_id: str, party_id: str | None, offset: int,
                        limit: int) -> tuple[list[Row], int, Decimal]:
        args = {"business_id": business_id, "party_id": party_id}
        totals = (await self.session.execute(_TOTALS, args)).one()
        rows = await self.session.execute(_PAGE, {**args, "offset": offset, "limit": limit})
        return list(rows.all()), totals.total, totals.amount

    async def detail(self, business_id: str, document_id: str) -> Row:
        return (await self.session.execute(_ONE, {"business_id": business_id, "party_id": None,
                                                  "document_id": document_id})).one()

    async def update_settings(self, business_id: str, version: int, values: dict) -> bool:
        """Optimistic update of the WHT columns; False when the row changed meanwhile."""
        result = await self.session.execute(
            update(BusinessSettings)
            .where(BusinessSettings.business_id == business_id, BusinessSettings.version == version)
            .values(**values, version=version + 1)
            .execution_options(synchronize_session=False)
        )
        self.session.expire_all()
        return result.rowcount == 1
