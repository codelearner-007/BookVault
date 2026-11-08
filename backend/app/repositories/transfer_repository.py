"""Inter-account transfers repository: the typed extension and its list (B3)."""

from sqlalchemy import select, text
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.banking import InterAccountTransfer

_FILTER = """
    FROM public.inter_account_transfers x
    JOIN public.documents d ON d.business_id = x.business_id AND d.id = x.document_id
    JOIN public.document_statuses s ON s.id = d.status_id
    LEFT JOIN public.bank_accounts f ON f.business_id = x.business_id AND f.id = x.from_bank_account_id
    LEFT JOIN public.bank_accounts t ON t.business_id = x.business_id AND t.id = x.to_bank_account_id
    WHERE x.business_id = :business_id
"""
_PAGE = text(f"""
    SELECT CAST(d.id AS text) AS id, d.reference, d.document_date AS date, s.key AS status, d.version,
           CAST(x.from_bank_account_id AS text) AS from_bank_account_id, f.name AS from_bank_account_name,
           CAST(x.to_bank_account_id AS text) AS to_bank_account_id, t.name AS to_bank_account_name,
           d.description, x.amount_sent AS amount
    {_FILTER}
    ORDER BY d.document_date DESC, d.id DESC
    OFFSET :offset LIMIT :limit
""")
_TOTALS = text(f"""
    SELECT count(*) AS total, COALESCE(sum(x.amount_sent) FILTER (WHERE s.key = 'posted'), 0) AS total_amount
    {_FILTER}
""")
_NAMES = text("""
    SELECT f.name AS from_name, f.can_have_pending AS from_pending, t.name AS to_name, t.can_have_pending AS to_pending
    FROM public.inter_account_transfers x
    LEFT JOIN public.bank_accounts f ON f.business_id = x.business_id AND f.id = x.from_bank_account_id
    LEFT JOIN public.bank_accounts t ON t.business_id = x.business_id AND t.id = x.to_bank_account_id
    WHERE x.business_id = :business_id AND x.document_id = :document_id
""")


class TransferRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_page(self, business_id: str, offset: int, limit: int) -> tuple[list[Row], int, object]:
        args = {"business_id": business_id}
        totals = (await self.session.execute(_TOTALS, args)).one()
        rows = (await self.session.execute(_PAGE, {**args, "offset": offset, "limit": limit})).all()
        return list(rows), totals.total, totals.total_amount

    async def get(self, business_id: str, document_id: str) -> InterAccountTransfer | None:
        return (await self.session.execute(select(InterAccountTransfer).where(
            InterAccountTransfer.business_id == business_id, InterAccountTransfer.document_id == document_id,
        ))).scalar_one_or_none()

    async def names(self, business_id: str, document_id: str) -> Row:
        return (await self.session.execute(_NAMES, {"business_id": business_id, "document_id": document_id})).one()

    async def add(self, row: InterAccountTransfer) -> None:
        self.session.add(row)
        await self.session.flush()

    async def save(self) -> None:
        await self.session.flush()
