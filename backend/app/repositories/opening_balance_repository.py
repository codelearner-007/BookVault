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
_LIVE_DOCUMENT_IDS = text("""
    SELECT CAST(o.document_id AS text) AS document_id, o.kind_key, CAST(o.account_id AS text) AS account_id
    FROM public.opening_balances o
    JOIN public.documents d ON d.business_id = o.business_id AND d.id = o.document_id
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key <> 'void'
    WHERE o.business_id = :business_id
    ORDER BY o.created_at, o.document_id
""")
_ORDINARY_BEFORE = text("""
    SELECT count(*) FROM public.documents d
    JOIN public.document_types t ON t.id = d.document_type_id AND t.key <> 'opening_balance'
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key <> 'void'
    WHERE d.business_id = :business_id AND d.document_date < :start
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

    async def live_documents(self, business_id: str) -> list[Row]:
        return list((await self.session.execute(_LIVE_DOCUMENT_IDS, {"business_id": business_id})).all())

    async def ordinary_documents_before(self, business_id: str, start: date) -> int:
        return (await self.session.execute(_ORDINARY_BEFORE, {"business_id": business_id, "start": start})).scalar_one()

    async def balance_sheet_accounts(self, business_id: str) -> list[Row]:
        return list((await self.session.execute(_BALANCE_SHEET_ACCOUNTS, {"business_id": business_id})).all())
