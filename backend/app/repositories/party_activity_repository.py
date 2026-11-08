"""What customers and suppliers were billed and paid, and every posted document with one party.

Plain reads under RLS: a user only sees (and totals) the documents of areas they may view.
Draft and void documents are left out; deleted ones no longer exist.
"""

from datetime import date

from sqlalchemy import text
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

# Cash line amount = round(qty x unit price, dp) - discount (as the receipts list).
_LINE_AMOUNT = "(round(COALESCE(x.qty, 1) * x.unit_price, :dp) - COALESCE(x.discount, 0))"
_POSTED = """
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key = 'posted'
    JOIN public.document_types t ON t.id = d.document_type_id
"""

# Billed = posted invoices - posted notes; settled = posted receipts (payments) naming the party as
# payer (payee) or on a line, whatever account the line uses. One row per party of the kind.
_TOTALS = """
    WITH billed AS (
        SELECT td.party_id, sum(CASE WHEN t.key = :invoice THEN tt.total ELSE -tt.total END) AS amount
        FROM public.trade_documents td
        JOIN public.documents d ON d.business_id = td.business_id AND d.id = td.document_id
        {posted}
        JOIN public.trade_document_totals tt ON tt.business_id = td.business_id AND tt.document_id = td.document_id
        WHERE td.business_id = :business_id AND t.key IN (:invoice, :note)
        GROUP BY td.party_id
    ), settled AS (
        SELECT COALESCE(c.counterparty_party_id, x.party_id) AS party_id, sum({line}) AS amount
        FROM public.cash_transactions c
        JOIN public.documents d ON d.business_id = c.business_id AND d.id = c.document_id
        {posted}
        JOIN public.cash_transaction_lines x ON x.business_id = c.business_id AND x.document_id = c.document_id
        WHERE c.business_id = :business_id AND c.direction = :direction
        GROUP BY 1
    )
    SELECT CAST(p.id AS text) AS party_id, COALESCE(b.amount, 0) AS billed, COALESCE(st.amount, 0) AS settled
    FROM public.{table} p
    LEFT JOIN billed b ON b.party_id = p.id
    LEFT JOIN settled st ON st.party_id = p.id
    WHERE p.business_id = :business_id
"""
_TOTALS_BY_TABLE = {
    table: text(_TOTALS.format(posted=_POSTED, line=_LINE_AMOUNT, table=table)) for table in ("customers", "suppliers")
}

# Every posted document with the party. `delta` = the document's debit - credit on the party's control
# account (AR / AP); `cash` = the receipt or payment amount attributed to the party. The running
# balance is taken over all of the party's documents before the date filter.
_ACTIVITY = f"""
    WITH docs AS (
        SELECT document_id FROM public.trade_documents WHERE business_id = :business_id AND party_id = :party_id
        UNION SELECT document_id FROM public.cash_transactions
              WHERE business_id = :business_id AND counterparty_party_id = :party_id
        UNION SELECT document_id FROM public.cash_transaction_lines WHERE business_id = :business_id AND party_id = :party_id
        UNION SELECT document_id FROM public.withholding_tax_receipts WHERE business_id = :business_id AND party_id = :party_id
        UNION SELECT e.document_id FROM public.journal_lines l
              JOIN public.journal_entries e ON e.business_id = l.business_id AND e.id = l.journal_entry_id
              WHERE l.business_id = :business_id AND l.party_id = :party_id
    ), rows AS (
        SELECT d.id, t.key AS document_type, d.document_date, d.reference, d.description, c.direction,
               COALESCE(ledger.delta, 0) AS delta, cash.amount AS cash
        FROM docs
        JOIN public.documents d ON d.business_id = :business_id AND d.id = docs.document_id
        {_POSTED}
        LEFT JOIN public.cash_transactions c ON c.business_id = d.business_id AND c.document_id = d.id
        LEFT JOIN LATERAL (
            SELECT sum(l.debit - l.credit) AS delta
            FROM public.journal_entries e
            JOIN public.journal_lines l ON l.business_id = e.business_id AND l.journal_entry_id = e.id
            JOIN public.coa_accounts a ON a.business_id = l.business_id AND a.id = l.account_id
            JOIN public.system_account_types st ON st.id = a.system_account_type_id AND st.code = :control
            WHERE e.business_id = d.business_id AND e.document_id = d.id AND l.party_id = :party_id) ledger ON true
        LEFT JOIN LATERAL (
            SELECT sum({_LINE_AMOUNT}) AS amount FROM public.cash_transaction_lines x
            WHERE x.business_id = c.business_id AND x.document_id = c.document_id
              AND COALESCE(c.counterparty_party_id, x.party_id) = :party_id) cash ON true
        WHERE t.key = ANY(CAST(:types AS text[])) OR COALESCE(ledger.delta, 0) <> 0 OR cash.amount IS NOT NULL
    ), ordered AS (
        SELECT *, sum(delta) OVER (ORDER BY document_date, id) AS running FROM rows
    )
    SELECT {{columns}} FROM ordered
    WHERE (CAST(:date_from AS date) IS NULL OR document_date >= CAST(:date_from AS date))
      AND (CAST(:date_to AS date) IS NULL OR document_date <= CAST(:date_to AS date))
"""
_ACTIVITY_PAGE = text(_ACTIVITY.format(columns="""
    CAST(id AS text) AS document_id, document_type, document_date AS date, reference, description,
    direction, delta, cash, running
""") + " ORDER BY document_date DESC, id DESC OFFSET :offset LIMIT :limit")
_ACTIVITY_COUNT = text(_ACTIVITY.format(columns="count(*)"))


class PartyActivityRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def totals(self, business_id: str, table: str, invoice: str, note: str, direction: str,
                     dp: int) -> dict[str, Row]:
        rows = await self.session.execute(_TOTALS_BY_TABLE[table], {
            "business_id": business_id, "invoice": invoice, "note": note, "direction": direction, "dp": dp})
        return {r.party_id: r for r in rows}

    async def activity(self, business_id: str, party_id: str, control: str, types: list[str], dp: int,
                       date_from: date | None, date_to: date | None, offset: int,
                       limit: int) -> tuple[list[Row], int]:
        args = {"business_id": business_id, "party_id": party_id, "control": control, "types": types, "dp": dp,
                "date_from": date_from, "date_to": date_to}
        total = (await self.session.execute(_ACTIVITY_COUNT, args)).scalar_one()
        rows = (await self.session.execute(_ACTIVITY_PAGE, {**args, "offset": offset, "limit": limit})).all()
        return list(rows), total
