"""Ledger read repository: journal entry lists and views, Trial Balance, GL Transactions.

Read-only (every write goes through app/services/posting/). RLS filters every row by the
caller's view right on the document's area, or the reports area for journal rows.
"""

from datetime import date

from sqlalchemy import text
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

_JE_LIST = text("""
    SELECT CAST(d.id AS text) AS id, d.reference, d.document_date AS date, d.description, s.key AS status, d.version,
           COALESCE((SELECT sum(l.debit) FROM public.document_lines l
                     WHERE l.business_id = d.business_id AND l.document_id = d.id), 0) AS amount
    FROM public.documents d
    JOIN public.document_statuses s ON s.id = d.status_id
    JOIN public.document_types t ON t.id = d.document_type_id
    WHERE d.business_id = :business_id AND t.key = :type_key
    ORDER BY d.document_date DESC, d.id DESC
    OFFSET :offset LIMIT :limit
""")
_JE_COUNT = text("""
    SELECT count(*) FROM public.documents d JOIN public.document_types t ON t.id = d.document_type_id
    WHERE d.business_id = :business_id AND t.key = :type_key
""")
_DOCUMENT_LINES = text("""
    SELECT CAST(l.id AS text) AS id, l.line_no, CAST(l.account_id AS text) AS account_id, a.code AS account_code, a.name AS account_name,
           l.description, l.debit, l.credit
    FROM public.document_lines l
    JOIN public.coa_accounts a ON a.business_id = l.business_id AND a.id = l.account_id
    WHERE l.business_id = :business_id AND l.document_id = :document_id
    ORDER BY l.line_no
""")
_DOCUMENT_AREA = text(
    "SELECT d.area_key FROM public.documents d WHERE d.business_id = :business_id AND d.id = :document_id"
)
_DOCUMENT_ENTRIES = text("""
    SELECT CAST(e.id AS text) AS id, e.entry_date, s.key AS source,
           CAST(e.reverses_entry_id AS text) AS reverses_entry_id, e.posted_at
    FROM public.journal_entries e
    JOIN public.journal_entry_sources s ON s.id = e.source_id
    WHERE e.business_id = :business_id AND e.document_id = :document_id
    ORDER BY e.posted_at, e.id
""")
_ENTRY_LINES = text("""
    SELECT CAST(l.journal_entry_id AS text) AS journal_entry_id, l.line_no,
           CAST(l.account_id AS text) AS account_id, a.code AS account_code,
           a.name AS account_name, l.description, l.debit, l.credit
    FROM public.journal_lines l
    JOIN public.coa_accounts a ON a.business_id = l.business_id AND a.id = l.account_id
    WHERE l.business_id = :business_id AND l.journal_entry_id = ANY(CAST(:entry_ids AS uuid[]))
    ORDER BY l.journal_entry_id, l.line_no
""")
_TRIAL_BALANCE = text("""
    SELECT CAST(a.id AS text) AS account_id, a.code AS account_code, a.name AS account_name, a.type AS account_type,
           sum(l.debit) - sum(l.credit) AS net
    FROM public.journal_lines l
    JOIN public.journal_entries e ON e.business_id = l.business_id AND e.id = l.journal_entry_id
    JOIN public.coa_accounts a ON a.business_id = l.business_id AND a.id = l.account_id
    WHERE l.business_id = :business_id AND COALESCE(l.line_date, e.entry_date) <= :as_at
    GROUP BY a.id, a.code, a.name, a.type, a.sort_order
    HAVING sum(l.debit) <> sum(l.credit)
    ORDER BY a.code NULLS LAST, a.sort_order, a.name
""")
# Reversed pairs (an entry that was reversed, and its reversal) are hidden unless asked for (PR-73).
_GLT_FILTER = """
    FROM public.journal_lines l
    JOIN public.journal_entries e ON e.business_id = l.business_id AND e.id = l.journal_entry_id
    JOIN public.journal_entry_sources s ON s.id = e.source_id
    JOIN public.documents d ON d.business_id = e.business_id AND d.id = e.document_id
    JOIN public.document_types t ON t.id = d.document_type_id
    JOIN public.coa_accounts a ON a.business_id = l.business_id AND a.id = l.account_id
    WHERE l.business_id = :business_id
      AND COALESCE(l.line_date, e.entry_date) BETWEEN :date_from AND :date_to
      AND (CAST(:account_id AS uuid) IS NULL OR l.account_id = CAST(:account_id AS uuid))
      AND (:include_reversed OR (e.reverses_entry_id IS NULL AND NOT EXISTS (
            SELECT 1 FROM public.journal_entries r
            WHERE r.business_id = e.business_id AND r.reverses_entry_id = e.id)))
"""
_GLT_PAGE = text(f"""
    SELECT CAST(l.id AS text) AS journal_line_id, CAST(e.id AS text) AS entry_id,
           CAST(e.document_id AS text) AS document_id,
           COALESCE(l.line_date, e.entry_date) AS date, d.reference, t.key AS document_type,
           COALESCE(l.description, d.description) AS description, CAST(l.account_id AS text) AS account_id,
           a.code AS account_code, a.name AS account_name, l.debit, l.credit, s.key AS source
    {_GLT_FILTER}
    ORDER BY COALESCE(l.line_date, e.entry_date), e.posted_at, e.id, l.line_no
    OFFSET :offset LIMIT :limit
""")
_GLT_COUNT = text(f"SELECT count(*) {_GLT_FILTER}")

# Summary: every account with its net as at :date_to (closing) and over the period; system
# accounts hidden until their tab is enabled or they have a balance (posting-rules §2).
_ACCOUNT_NETS = text("""
    SELECT CAST(a.id AS text) AS id, a.name, a.code, CAST(a.group_id AS text) AS group_id, a.type,
           s.code AS system_account_code, COALESCE(n.closing, 0) AS closing, COALESCE(n.period, 0) AS period,
           (s.id IS NULL OR s.always_visible OR COALESCE(n.closing, 0) <> 0 OR COALESCE(n.period, 0) <> 0
            OR COALESCE(bt.enabled, t.default_enabled, false)) AS is_visible
    FROM public.coa_accounts a
    LEFT JOIN public.system_account_types s ON s.id = a.system_account_type_id
    LEFT JOIN public.admin_tabs t ON t.id = s.enabled_by_admin_tab_id
    LEFT JOIN public.business_tabs bt ON bt.business_id = a.business_id AND bt.key = t.key
    LEFT JOIN (
        SELECT l.account_id,
               sum(l.debit - l.credit) AS closing,
               sum(l.debit - l.credit) FILTER (WHERE COALESCE(l.line_date, e.entry_date) >= :date_from) AS period
        FROM public.journal_lines l
        JOIN public.journal_entries e ON e.business_id = l.business_id AND e.id = l.journal_entry_id
        WHERE l.business_id = :business_id AND COALESCE(l.line_date, e.entry_date) <= :date_to
        GROUP BY l.account_id
    ) n ON n.account_id = a.id
    WHERE a.business_id = :business_id
    ORDER BY a.sort_order, a.code NULLS LAST, a.name
""")


class LedgerQueryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def journal_entry_page(
        self, business_id: str, type_key: str, offset: int, limit: int
    ) -> tuple[list[Row], int]:
        args = {"business_id": business_id, "type_key": type_key}
        total = (await self.session.execute(_JE_COUNT, args)).scalar_one()
        rows = (await self.session.execute(_JE_LIST, {**args, "offset": offset, "limit": limit})).all()
        return list(rows), total

    async def document_lines(self, business_id: str, document_id: str) -> list[Row]:
        args = {"business_id": business_id, "document_id": document_id}
        return list((await self.session.execute(_DOCUMENT_LINES, args)).all())

    async def document_area(self, business_id: str, document_id: str) -> str | None:
        return (await self.session.execute(_DOCUMENT_AREA, {"business_id": business_id, "document_id": document_id})).scalar_one_or_none()

    async def document_entries(self, business_id: str, document_id: str) -> tuple[list[Row], list[Row]]:
        """The document's journal entries (originals and reversals) and all their lines."""
        args = {"business_id": business_id, "document_id": document_id}
        entries = list((await self.session.execute(_DOCUMENT_ENTRIES, args)).all())
        if not entries:
            return [], []
        lines = await self.session.execute(
            _ENTRY_LINES, {"business_id": business_id, "entry_ids": [e.id for e in entries]}
        )
        return entries, list(lines.all())

    async def trial_balance(self, business_id: str, as_at: date) -> list[Row]:
        return list((await self.session.execute(_TRIAL_BALANCE, {"business_id": business_id, "as_at": as_at})).all())

    async def account_nets(self, business_id: str, date_from: date, date_to: date) -> list[Row]:
        args = {"business_id": business_id, "date_from": date_from, "date_to": date_to}
        return list((await self.session.execute(_ACCOUNT_NETS, args)).all())

    async def general_ledger_page(
        self, business_id: str, date_from: date, date_to: date, account_id: str | None,
        include_reversed: bool, offset: int, limit: int,
    ) -> tuple[list[Row], int]:
        args = {
            "business_id": business_id, "date_from": date_from, "date_to": date_to,
            "account_id": account_id, "include_reversed": include_reversed,
        }
        total = (await self.session.execute(_GLT_COUNT, args)).scalar_one()
        rows = (await self.session.execute(_GLT_PAGE, {**args, "offset": offset, "limit": limit})).all()
        return list(rows), total
