"""Receipts and payments repository: cash_transactions + cash_transaction_lines and their reads (B3).

Document rows and journal lines are written by the posting service only; this repository writes
the typed extension and its editable lines. RLS filters every row by the document's area.
"""

from sqlalchemy import delete, select, text
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.banking import CashTransaction, CashTransactionLine

_PARTY_NAME = "COALESCE(cu.name, su.name, ca.name)"


def _party_joins(alias: str, column: str) -> str:
    return f"""
    LEFT JOIN public.customers cu ON cu.business_id = {alias}.business_id AND cu.id = {alias}.{column}
    LEFT JOIN public.suppliers su ON su.business_id = {alias}.business_id AND su.id = {alias}.{column}
    LEFT JOIN public.capital_accounts ca ON ca.business_id = {alias}.business_id AND ca.party_id = {alias}.{column}
    """


# Line amount = round(qty x unit price, dp) - discount (discount stored already rounded).
_LINE_AMOUNT = "(round(COALESCE(x.qty, 1) * x.unit_price, :dp) - COALESCE(x.discount, 0))"

_LIST_FILTER = f"""
    FROM public.cash_transactions c
    JOIN public.documents d ON d.business_id = c.business_id AND d.id = c.document_id
    JOIN public.document_statuses s ON s.id = d.status_id
    LEFT JOIN public.bank_accounts b ON b.business_id = c.business_id AND b.id = c.bank_account_id
    {_party_joins("c", "counterparty_party_id")}
    LEFT JOIN LATERAL (SELECT sum({_LINE_AMOUNT}) AS amount FROM public.cash_transaction_lines x
                       WHERE x.business_id = c.business_id AND x.document_id = c.document_id) t ON true
    WHERE c.business_id = :business_id AND c.direction = :direction
      AND (CAST(:bank_account_id AS uuid) IS NULL OR c.bank_account_id = CAST(:bank_account_id AS uuid))
      AND (CAST(:party_id AS uuid) IS NULL OR c.counterparty_party_id = CAST(:party_id AS uuid))
"""
_LIST_PAGE = text(f"""
    SELECT CAST(d.id AS text) AS id, d.reference, d.document_date AS date, s.key AS status, d.version,
           CAST(c.bank_account_id AS text) AS bank_account_id, b.name AS bank_account_name, d.description,
           COALESCE(c.counterparty_name, {_PARTY_NAME}) AS counterparty, COALESCE(t.amount, 0) AS amount,
           (c.clears_later AND c.cleared_on IS NULL) AS is_pending
    {_LIST_FILTER}
    ORDER BY d.document_date DESC, d.id DESC
    OFFSET :offset LIMIT :limit
""")
_LIST_TOTALS = text(f"""
    SELECT count(*) AS total, COALESCE(sum(t.amount) FILTER (WHERE s.key = 'posted'), 0) AS total_amount
    {_LIST_FILTER}
""")
_DETAIL = text(f"""
    SELECT b.name AS bank_account_name, COALESCE(b.can_have_pending, false) AS bank_can_have_pending,
           p.kind_key AS counterparty_kind, {_PARTY_NAME} AS party_name
    FROM public.cash_transactions c
    LEFT JOIN public.bank_accounts b ON b.business_id = c.business_id AND b.id = c.bank_account_id
    LEFT JOIN public.parties p ON p.business_id = c.business_id AND p.id = c.counterparty_party_id
    {_party_joins("c", "counterparty_party_id")}
    WHERE c.business_id = :business_id AND c.document_id = :document_id
""")
_LINES = text(f"""
    SELECT CAST(x.id AS text) AS id, x.line_no, CAST(x.account_id AS text) AS account_id, a.code AS account_code,
           a.name AS account_name, CAST(x.party_id AS text) AS party_id, {_PARTY_NAME} AS party_name,
           CAST(x.invoice_document_id AS text) AS invoice_id, inv.reference AS invoice_reference,
           x.description, x.qty, x.unit_price, x.discount
    FROM public.cash_transaction_lines x
    LEFT JOIN public.coa_accounts a ON a.business_id = x.business_id AND a.id = x.account_id
    LEFT JOIN public.documents inv ON inv.business_id = x.business_id AND inv.id = x.invoice_document_id
    {_party_joins("x", "party_id")}
    WHERE x.business_id = :business_id AND x.document_id = :document_id
    ORDER BY x.line_no
""")
_LINES_REPORT_FILTER = """
    FROM public.cash_transaction_lines x
    JOIN public.cash_transactions c ON c.business_id = x.business_id AND c.document_id = x.document_id
    JOIN public.documents d ON d.business_id = c.business_id AND d.id = c.document_id
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key = 'posted'
    WHERE x.business_id = :business_id AND c.direction = :direction
"""
_LINES_REPORT = text(f"""
    SELECT CAST(d.id AS text) AS document_id, d.document_date AS date, d.reference, b.name AS bank_account_name,
           COALESCE(c.counterparty_name, cpu.name, cps.name, cpc.name) AS counterparty, a.name AS account_name,
           x.description, x.qty, x.unit_price, x.discount, {_LINE_AMOUNT} AS amount
    FROM public.cash_transaction_lines x
    JOIN public.cash_transactions c ON c.business_id = x.business_id AND c.document_id = x.document_id
    JOIN public.documents d ON d.business_id = c.business_id AND d.id = c.document_id
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key = 'posted'
    LEFT JOIN public.bank_accounts b ON b.business_id = c.business_id AND b.id = c.bank_account_id
    LEFT JOIN public.coa_accounts a ON a.business_id = x.business_id AND a.id = x.account_id
    LEFT JOIN public.customers cpu ON cpu.business_id = c.business_id AND cpu.id = c.counterparty_party_id
    LEFT JOIN public.suppliers cps ON cps.business_id = c.business_id AND cps.id = c.counterparty_party_id
    LEFT JOIN public.capital_accounts cpc ON cpc.business_id = c.business_id
                                         AND cpc.party_id = c.counterparty_party_id
    WHERE x.business_id = :business_id AND c.direction = :direction
    ORDER BY d.document_date DESC, d.id DESC, x.line_no
    OFFSET :offset LIMIT :limit
""")
_LINES_REPORT_COUNT = text(f"SELECT count(*) {_LINES_REPORT_FILTER}")
_ALLOCATIONS = text("""
    SELECT CAST(pa.invoice_document_id AS text) AS invoice_id, inv.reference AS invoice_reference, pa.amount,
           pa.early_discount
    FROM public.payment_allocations pa
    LEFT JOIN public.documents inv ON inv.business_id = pa.business_id AND inv.id = pa.invoice_document_id
    WHERE pa.business_id = :business_id AND pa.settling_document_id = :document_id
    ORDER BY inv.document_date, pa.id
""")
_PARTY_KINDS = text("""
    SELECT CAST(id AS text) AS id, kind_key FROM public.parties
    WHERE business_id = :business_id AND id = ANY(CAST(:ids AS uuid[]))
""")


class CashTransactionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ---------------------------------------------------------------- reads
    async def list_page(
        self, business_id: str, direction: str, dp: int, offset: int, limit: int,
        bank_account_id: str | None = None, party_id: str | None = None,
    ) -> tuple[list[Row], int, object]:
        args = {"business_id": business_id, "direction": direction, "dp": dp,
                "bank_account_id": bank_account_id, "party_id": party_id}
        totals = (await self.session.execute(_LIST_TOTALS, args)).one()
        rows = (await self.session.execute(_LIST_PAGE, {**args, "offset": offset, "limit": limit})).all()
        return list(rows), totals.total, totals.total_amount

    async def get(self, business_id: str, document_id: str) -> CashTransaction | None:
        return (await self.session.execute(select(CashTransaction).where(
            CashTransaction.business_id == business_id, CashTransaction.document_id == document_id,
        ))).scalar_one_or_none()

    async def detail(self, business_id: str, document_id: str) -> Row:
        return (await self.session.execute(_DETAIL, {"business_id": business_id, "document_id": document_id})).one()

    async def line_rows(self, business_id: str, document_id: str) -> list[Row]:
        return list((await self.session.execute(
            _LINES, {"business_id": business_id, "document_id": document_id})).all())

    async def lines(self, business_id: str, document_id: str) -> list[CashTransactionLine]:
        result = await self.session.execute(
            select(CashTransactionLine)
            .where(CashTransactionLine.business_id == business_id, CashTransactionLine.document_id == document_id)
            .order_by(CashTransactionLine.line_no)
        )
        return list(result.scalars().all())

    async def lines_report(
        self, business_id: str, direction: str, dp: int, offset: int, limit: int
    ) -> tuple[list[Row], int]:
        args = {"business_id": business_id, "direction": direction}
        total = (await self.session.execute(_LINES_REPORT_COUNT, args)).scalar_one()
        rows = (await self.session.execute(_LINES_REPORT, {**args, "dp": dp, "offset": offset, "limit": limit})).all()
        return list(rows), total

    async def allocations(self, business_id: str, document_id: str) -> list[Row]:
        return list((await self.session.execute(
            _ALLOCATIONS, {"business_id": business_id, "document_id": document_id})).all())

    async def party_kinds(self, business_id: str, ids: set[str]) -> dict[str, str]:
        rows = await self.session.execute(_PARTY_KINDS, {"business_id": business_id, "ids": list(ids)})
        return {r.id: r.kind_key for r in rows}

    # ---------------------------------------------------------------- writes
    async def add(self, row: CashTransaction) -> None:
        self.session.add(row)
        await self.session.flush()

    async def save(self) -> None:
        await self.session.flush()

    async def replace_lines(self, business_id: str, document_id: str, lines: list[CashTransactionLine]) -> None:
        await self.session.execute(delete(CashTransactionLine).where(
            CashTransactionLine.business_id == business_id, CashTransactionLine.document_id == document_id,
        ))
        self.session.add_all(lines)
        await self.session.flush()
