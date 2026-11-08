"""Opening balances read repository (writes go through the posting service)."""

from datetime import date

from sqlalchemy import text
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

# Live (non-void) account opening balances with the amount on the account's own line.
_LIVE_ACCOUNT_OPENINGS = text("""
    SELECT CAST(o.account_id AS text) AS account_id, CAST(o.document_id AS text) AS document_id,
           l.debit, l.credit
    FROM public.opening_balances o
    JOIN public.documents d ON d.business_id = o.business_id AND d.id = o.document_id
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key <> 'void'
    JOIN public.document_lines l ON l.business_id = o.business_id AND l.document_id = o.document_id
                                AND l.account_id = o.account_id
    WHERE o.business_id = :business_id AND o.kind_key = 'account'
""")
# Live bank-account opening balances with the amount on the bank account's own line (B3).
_LIVE_BANK_OPENINGS = text("""
    SELECT CAST(o.bank_account_id AS text) AS bank_account_id, CAST(o.document_id AS text) AS document_id,
           l.debit, l.credit
    FROM public.opening_balances o
    JOIN public.documents d ON d.business_id = o.business_id AND d.id = o.document_id
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key <> 'void'
    JOIN public.document_lines l ON l.business_id = o.business_id AND l.document_id = o.document_id
                                AND l.bank_account_id = o.bank_account_id
    WHERE o.business_id = :business_id AND o.kind_key = 'bank_account'
""")
_LIVE_DOCUMENT_IDS = text("""
    SELECT CAST(o.document_id AS text) AS document_id, o.kind_key, CAST(o.account_id AS text) AS account_id,
           CAST(o.bank_account_id AS text) AS bank_account_id
    FROM public.opening_balances o
    JOIN public.documents d ON d.business_id = o.business_id AND d.id = o.document_id
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key <> 'void'
    WHERE o.business_id = :business_id
    ORDER BY o.created_at, o.document_id
""")
# Starting-balance invoices (PR-61) are the one kind of document allowed before the books start.
_ORDINARY_BEFORE = text("""
    SELECT count(*) FROM public.documents d
    JOIN public.document_types t ON t.id = d.document_type_id AND t.key <> 'opening_balance'
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key <> 'void'
    LEFT JOIN public.invoice_terms it ON it.business_id = d.business_id AND it.document_id = d.id
    WHERE d.business_id = :business_id AND d.document_date < :start AND NOT COALESCE(it.is_starting_balance, false)
""")
_LIVE_INVOICE_OPENINGS = """
    SELECT CAST(o.document_id AS text) AS document_id, CAST(o.invoice_document_id AS text) AS invoice_id,
           o.paid_before_start
    FROM public.opening_balances o
    JOIN public.documents d ON d.business_id = o.business_id AND d.id = o.document_id
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key <> 'void'
    WHERE o.business_id = :business_id AND o.kind_key = 'sales_invoice'
"""
_STARTING_INVOICES = """
    SELECT CAST(d.id AS text) AS invoice_id, d.reference, d.document_date AS date,
           CAST(td.party_id AS text) AS customer_id, cu.name AS customer_name, COALESCE(t.total, 0) AS total,
           o.paid_before_start, CAST(o.document_id AS text) AS document_id
    FROM public.documents d
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key = 'posted'
    JOIN public.invoice_terms it ON it.business_id = d.business_id AND it.document_id = d.id AND it.is_starting_balance
    JOIN public.trade_documents td ON td.business_id = d.business_id AND td.document_id = d.id
    LEFT JOIN public.customers cu ON cu.business_id = td.business_id AND cu.id = td.party_id
    LEFT JOIN public.trade_document_totals t ON t.business_id = d.business_id AND t.document_id = d.id
    LEFT JOIN (
        SELECT o.document_id, o.invoice_document_id, o.paid_before_start
        FROM public.opening_balances o
        JOIN public.documents od ON od.business_id = o.business_id AND od.id = o.document_id
        JOIN public.document_statuses os ON os.id = od.status_id AND os.key <> 'void'
        WHERE o.business_id = :business_id AND o.kind_key = 'sales_invoice'
    ) o ON o.invoice_document_id = d.id
    WHERE d.business_id = :business_id
"""
_STARTING_INVOICES_PAGE = text(_STARTING_INVOICES + " ORDER BY d.document_date, d.id OFFSET :offset LIMIT :limit")
_STARTING_INVOICES_COUNT = text(f"SELECT count(*) FROM ({_STARTING_INVOICES}) x")
_STARTING_INVOICE = text(_STARTING_INVOICES + " AND d.id = :invoice_id")
_STARTING_ON_OR_AFTER = text("""
    SELECT count(*) FROM public.invoice_terms it
    JOIN public.documents d ON d.business_id = it.business_id AND d.id = it.document_id
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key <> 'void'
    WHERE it.business_id = :business_id AND it.is_starting_balance AND d.document_date >= :start
""")
_BALANCE_SHEET_ACCOUNTS = text("""
    SELECT CAST(a.id AS text) AS id, a.code, a.name, CAST(a.group_id AS text) AS group_id,
           s.code AS system_account_code, s.subledger_kind
    FROM public.coa_accounts a
    LEFT JOIN public.system_account_types s ON s.id = a.system_account_type_id
    WHERE a.business_id = :business_id AND a.type IN ('asset', 'liability', 'equity')
    ORDER BY a.sort_order, a.code NULLS LAST, a.name
""")


class OpeningBalanceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def live_account_openings(self, business_id: str) -> dict[str, Row]:
        rows = (await self.session.execute(_LIVE_ACCOUNT_OPENINGS, {"business_id": business_id})).all()
        return {r.account_id: r for r in rows}

    async def live_bank_openings(self, business_id: str) -> dict[str, Row]:
        rows = (await self.session.execute(_LIVE_BANK_OPENINGS, {"business_id": business_id})).all()
        return {r.bank_account_id: r for r in rows}

    async def live_documents(self, business_id: str) -> list[Row]:
        return list((await self.session.execute(_LIVE_DOCUMENT_IDS, {"business_id": business_id})).all())

    async def ordinary_documents_before(self, business_id: str, start: date) -> int:
        return (await self.session.execute(_ORDINARY_BEFORE, {"business_id": business_id, "start": start})).scalar_one()

    async def balance_sheet_accounts(self, business_id: str) -> list[Row]:
        return list((await self.session.execute(_BALANCE_SHEET_ACCOUNTS, {"business_id": business_id})).all())

    async def live_invoice_openings(self, business_id: str) -> list[Row]:
        return list((await self.session.execute(text(_LIVE_INVOICE_OPENINGS), {"business_id": business_id})).all())

    async def live_invoice_opening(self, business_id: str, invoice_id: str) -> Row | None:
        return (await self.session.execute(text(_LIVE_INVOICE_OPENINGS + " AND o.invoice_document_id = :invoice_id"),
                                           {"business_id": business_id, "invoice_id": invoice_id})).one_or_none()

    async def starting_balance_invoices(self, business_id: str, offset: int, limit: int) -> tuple[list[Row], int]:
        total = (await self.session.execute(_STARTING_INVOICES_COUNT, {"business_id": business_id})).scalar_one()
        rows = await self.session.execute(_STARTING_INVOICES_PAGE, {"business_id": business_id, "offset": offset,
                                                                    "limit": limit})
        return list(rows.all()), total

    async def starting_balance_invoice(self, business_id: str, invoice_id: str) -> Row | None:
        return (await self.session.execute(_STARTING_INVOICE, {"business_id": business_id,
                                                               "invoice_id": invoice_id})).one_or_none()

    async def starting_balance_invoices_on_or_after(self, business_id: str, start: date) -> int:
        return (await self.session.execute(_STARTING_ON_OR_AFTER, {"business_id": business_id,
                                                                   "start": start})).scalar_one()
