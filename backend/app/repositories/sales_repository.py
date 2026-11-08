"""Trade documents repository: trade_documents, lines, invoice terms, late fees, links and their reads (B4).

Document rows, journal lines and allocations are written by the posting service only; this
repository writes the typed extensions and their editable lines. Amounts come from the database
(trade_line_amounts(), views trade_document_line_amounts / trade_document_totals) so a list, a
view and a posting always agree. RLS filters every row by the document's area; balances that
need other areas (receipts settling an invoice) come from definer functions (B0.4).
"""

from decimal import Decimal

from sqlalchemy import delete, select, text
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sales import (
    InvoiceTerms,
    LatePaymentFee,
    TradeDocument,
    TradeDocumentFreightLine,
    TradeDocumentLine,
    TradeDocumentLineTax,
)

_LIST_FILTER = """
    FROM public.documents d
    JOIN public.document_types ty ON ty.id = d.document_type_id AND ty.key = :type_key
    JOIN public.document_statuses s ON s.id = d.status_id
    JOIN public.trade_documents td ON td.business_id = d.business_id AND td.document_id = d.id
    LEFT JOIN public.customers cu ON cu.business_id = td.business_id AND cu.id = td.party_id
    LEFT JOIN public.suppliers su ON su.business_id = td.business_id AND su.id = td.party_id
    LEFT JOIN public.trade_document_totals t ON t.business_id = d.business_id AND t.document_id = d.id
    LEFT JOIN public.invoice_terms it ON it.business_id = d.business_id AND it.document_id = d.id
    WHERE d.business_id = :business_id
      AND (CAST(:party_id AS uuid) IS NULL OR td.party_id = CAST(:party_id AS uuid))
      AND (CAST(:search AS text) IS NULL OR d.reference ILIKE :pattern OR d.description ILIKE :pattern
           OR cu.name ILIKE :pattern OR su.name ILIKE :pattern)
      AND s.key <> 'void'  -- deleted documents appear only in History
"""
_LIST_PAGE = text(f"""
    SELECT CAST(d.id AS text) AS id, d.reference, d.document_date AS date, CAST(td.party_id AS text) AS party_id,
           COALESCE(cu.name, su.name) AS party_name, d.description, s.key AS status, d.version,
           COALESCE(t.total, 0) AS total, td.expiry_date, it.due_date, it.is_closed
    {_LIST_FILTER}
    ORDER BY COALESCE(it.is_closed, false), d.document_date DESC, d.id DESC
    OFFSET :offset LIMIT :limit
""")
_LIST_TOTALS = text(f"""
    SELECT count(*) AS total, COALESCE(sum(t.total) FILTER (WHERE s.key = 'posted'), 0) AS total_amount
    {_LIST_FILTER}
""")
_DETAIL = text("""
    SELECT COALESCE(cu.name, su.name) AS party_name, t.subtotal, t.tax_total, t.rounding, t.total, t.freight,
           t.withholding_tax, t.gross_total
    FROM public.trade_documents td
    LEFT JOIN public.customers cu ON cu.business_id = td.business_id AND cu.id = td.party_id
    LEFT JOIN public.suppliers su ON su.business_id = td.business_id AND su.id = td.party_id
    LEFT JOIN public.trade_document_totals t ON t.business_id = td.business_id AND t.document_id = td.document_id
    WHERE td.business_id = :business_id AND td.document_id = :document_id
""")
_LINES = text("""
    SELECT CAST(x.id AS text) AS id, x.line_no, CAST(x.item_id AS text) AS item_id, i.name AS item_name,
           CAST(x.account_id AS text) AS account_id, a.code AS account_code, a.name AS account_name,
           x.description, x.qty, x.unit_price, x.discount, CAST(x.tax_code_id AS text) AS tax_code_id,
           tc.name AS tax_code_name, x.tax_rate, CAST(x.tax_account_id AS text) AS tax_account_id,
           x.tax_reverse_charge, COALESCE(m.net, 0) AS net, COALESCE(m.tax, 0) AS tax,
           COALESCE(m.self_assessed_tax, 0) AS self_assessed_tax
    FROM public.trade_document_lines x
    LEFT JOIN public.trade_document_line_amounts m ON m.business_id = x.business_id AND m.line_id = x.id
    LEFT JOIN public.items i ON i.business_id = x.business_id AND i.id = x.item_id
    LEFT JOIN public.coa_accounts a ON a.business_id = x.business_id AND a.id = x.account_id
    LEFT JOIN public.tax_codes tc ON tc.business_id = x.business_id AND tc.id = x.tax_code_id
    WHERE x.business_id = :business_id AND x.document_id = :document_id
    ORDER BY x.line_no
""")
_PREVIEW = text("""
    SELECT x.ord, a.net, a.tax
    FROM unnest(CAST(:qty AS numeric[]), CAST(:price AS numeric[]), CAST(:discount AS numeric[]),
                CAST(:rate AS numeric[])) WITH ORDINALITY AS x(qty, price, discount, rate, ord)
    CROSS JOIN LATERAL public.trade_line_amounts(x.qty, x.price, CAST(:discount_type AS text), x.discount,
                                                 x.rate, :inclusive, :dp) a
    ORDER BY x.ord
""")
_LINE_TAXES = text("""
    SELECT CAST(t.line_id AS text) AS line_id, CAST(t.component_id AS text) AS component_id, t.line_no, t.rate,
           CAST(t.account_id AS text) AS account_id, c.name
    FROM public.trade_document_line_taxes t
    JOIN public.trade_document_lines x ON x.business_id = t.business_id AND x.id = t.line_id
    LEFT JOIN public.tax_code_components c ON c.business_id = t.business_id AND c.id = t.component_id
    WHERE x.business_id = :business_id AND x.document_id = :document_id
    ORDER BY t.line_id, t.line_no
""")
_WHT_BASE = text("SELECT wht_base_key FROM public.business_settings WHERE business_id = :business_id")
_ROUNDING = text("""
    SELECT CASE CAST(:method AS text) WHEN 'nearest' THEN round(CAST(:gross AS numeric), 0) - CAST(:gross AS numeric)
                WHEN 'down' THEN trunc(CAST(:gross AS numeric)) - CAST(:gross AS numeric) ELSE 0 END
""")
_BALANCES = text("""
    SELECT CAST(invoice_document_id AS text) AS invoice_id, CAST(party_id AS text) AS party_id, document_date,
           reference, due_date, total, fees, applied, balance_due, early_discount_rate, early_discount_days,
           late_fee_rate, is_closed
    FROM public.invoice_balances(:business_id, CAST(:ids AS uuid[]), CAST(:party_id AS uuid), :type_key)
    ORDER BY document_date, invoice_document_id
""")
_BALANCE_TOTAL = text("""
    SELECT COALESCE(sum(balance_due), 0)
    FROM public.invoice_balances(:business_id, NULL, CAST(:party_id AS uuid), :type_key)
""")
_APPLICATIONS = text("""
    SELECT CAST(document_id AS text) AS document_id, document_type, document_date AS date, reference, amount,
           early_discount, is_credit_application
    FROM public.invoice_applications(:business_id, :invoice_id)
""")
_SETTLED = text("""
    SELECT CAST(pa.invoice_document_id AS text) AS document_id, 'sales_invoice' AS document_type,
           inv.document_date AS date, inv.reference, pa.amount, pa.early_discount
    FROM public.payment_allocations pa
    LEFT JOIN public.documents inv ON inv.business_id = pa.business_id AND inv.id = pa.invoice_document_id
    WHERE pa.business_id = :business_id AND pa.settling_document_id = :document_id
    ORDER BY inv.document_date, pa.id
""")
_LINKS = text("""
    SELECT CAST(k.from_document_id AS text) AS from_id, CAST(k.to_document_id AS text) AS to_id, k.link_type_key,
           fd.reference AS from_reference, ft.key AS from_type, fs.key AS from_status,
           tdoc.reference AS to_reference, tt.key AS to_type, ts.key AS to_status
    FROM public.document_links k
    LEFT JOIN public.documents fd ON fd.business_id = k.business_id AND fd.id = k.from_document_id
    LEFT JOIN public.document_types ft ON ft.id = fd.document_type_id
    LEFT JOIN public.document_statuses fs ON fs.id = fd.status_id
    LEFT JOIN public.documents tdoc ON tdoc.business_id = k.business_id AND tdoc.id = k.to_document_id
    LEFT JOIN public.document_types tt ON tt.id = tdoc.document_type_id
    LEFT JOIN public.document_statuses ts ON ts.id = tdoc.status_id
    WHERE k.business_id = :business_id
      AND (k.from_document_id = ANY(CAST(:ids AS uuid[])) OR k.to_document_id = ANY(CAST(:ids AS uuid[])))
""")
_LATE_FEES_OF = text("""
    SELECT CAST(f.document_id AS text) AS document_id, d.document_date AS date, d.reference, f.amount
    FROM public.late_payment_fees f
    JOIN public.documents d ON d.business_id = f.business_id AND d.id = f.document_id
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key = 'posted'
    WHERE f.business_id = :business_id AND f.invoice_document_id = :invoice_id
    ORDER BY d.document_date, d.id
""")
_LINES_REPORT_FILTER = """
    FROM public.trade_document_lines x
    JOIN public.documents d ON d.business_id = x.business_id AND d.id = x.document_id
    JOIN public.document_types ty ON ty.id = d.document_type_id AND ty.key = :type_key
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key = 'posted'
    WHERE x.business_id = :business_id
"""
_LINES_REPORT = text("""
    SELECT CAST(d.id AS text) AS document_id, d.document_date AS date, d.reference,
           COALESCE(cu.name, su.name) AS party_name, i.name AS item_name, a.name AS account_name, x.description, x.qty, x.unit_price,
           COALESCE(m.net, 0) AS net, COALESCE(m.tax, 0) AS tax
    FROM public.trade_document_lines x
    JOIN public.documents d ON d.business_id = x.business_id AND d.id = x.document_id
    JOIN public.document_types ty ON ty.id = d.document_type_id AND ty.key = :type_key
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key = 'posted'
    JOIN public.trade_documents td ON td.business_id = x.business_id AND td.document_id = x.document_id
    LEFT JOIN public.customers cu ON cu.business_id = td.business_id AND cu.id = td.party_id
    LEFT JOIN public.suppliers su ON su.business_id = td.business_id AND su.id = td.party_id
    LEFT JOIN public.items i ON i.business_id = x.business_id AND i.id = x.item_id
    LEFT JOIN public.coa_accounts a ON a.business_id = x.business_id AND a.id = x.account_id
    LEFT JOIN public.trade_document_line_amounts m ON m.business_id = x.business_id AND m.line_id = x.id
    WHERE x.business_id = :business_id
    ORDER BY d.document_date DESC, d.id DESC, x.line_no
    OFFSET :offset LIMIT :limit
""")
_LINES_REPORT_COUNT = text(f"SELECT count(*) {_LINES_REPORT_FILTER}")
_PARTY_KIND = text("""
    SELECT p.kind_key FROM public.parties p WHERE p.business_id = :business_id AND p.id = :party_id
""")
_HAS_RIGHT = text("SELECT public.has_area_access(:business_id, :area_key, :right_key)")
_PARTY_CREDITS = text("""
    SELECT CAST(settling_document_id AS text) AS settling_document_id, document_date, available
    FROM public.party_credits(:business_id, :party_id, :control)
""")
_AR_BALANCE = text("""
    SELECT COALESCE(sum(l.debit - l.credit), 0)
    FROM public.journal_lines l
    JOIN public.coa_accounts a ON a.business_id = l.business_id AND a.id = l.account_id
    JOIN public.system_account_types st ON st.id = a.system_account_type_id AND st.code = 'accounts_receivable'
    WHERE l.business_id = :business_id AND l.party_id = :party_id
""")
_CUSTOMER_NAMES = text("SELECT CAST(id AS text) AS id, name FROM public.customers WHERE business_id = :business_id")
_CUSTOMER_SUMMARIES = text("""
    SELECT CAST(party_id AS text) AS party_id, ar_balance, has_history, uninvoiced, qty_to_deliver
    FROM public.customer_summaries(:business_id)
""")
_SUPPLIER_SUMMARIES = text("""
    SELECT CAST(party_id AS text) AS party_id, ap_balance, has_history, qty_to_receive
    FROM public.supplier_summaries(:business_id)
""")


class SalesRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ---------------------------------------------------------------- extension rows
    async def get(self, business_id: str, document_id: str) -> TradeDocument | None:
        return (await self.session.execute(select(TradeDocument).where(
            TradeDocument.business_id == business_id, TradeDocument.document_id == document_id,
        ))).scalar_one_or_none()

    async def terms(self, business_id: str, document_id: str) -> InvoiceTerms | None:
        return (await self.session.execute(select(InvoiceTerms).where(
            InvoiceTerms.business_id == business_id, InvoiceTerms.document_id == document_id,
        ))).scalar_one_or_none()

    async def lines(self, business_id: str, document_id: str) -> list[TradeDocumentLine]:
        result = await self.session.execute(
            select(TradeDocumentLine)
            .where(TradeDocumentLine.business_id == business_id, TradeDocumentLine.document_id == document_id)
            .order_by(TradeDocumentLine.line_no)
        )
        return list(result.scalars().all())

    async def late_fee(self, business_id: str, document_id: str) -> LatePaymentFee | None:
        return (await self.session.execute(select(LatePaymentFee).where(
            LatePaymentFee.business_id == business_id, LatePaymentFee.document_id == document_id,
        ))).scalar_one_or_none()

    async def add(self, row) -> None:
        self.session.add(row)
        await self.session.flush()

    async def save(self) -> None:
        await self.session.flush()

    async def replace_lines(self, business_id: str, document_id: str, lines: list[TradeDocumentLine]) -> None:
        await self.session.execute(delete(TradeDocumentLine).where(
            TradeDocumentLine.business_id == business_id, TradeDocumentLine.document_id == document_id,
        ))
        self.session.add_all(lines)
        await self.session.flush()

    async def replace_line_taxes(self, rows: list[TradeDocumentLineTax]) -> None:
        """Component snapshots of freshly stored lines (the old ones went with their lines, ON DELETE CASCADE)."""
        self.session.add_all(rows)
        await self.session.flush()

    async def line_taxes(self, business_id: str, document_id: str) -> dict[str, list[Row]]:
        found: dict[str, list[Row]] = {}
        for row in await self.session.execute(_LINE_TAXES, {"business_id": business_id, "document_id": document_id}):
            found.setdefault(row.line_id, []).append(row)
        return found

    async def freight_lines(self, business_id: str, document_id: str) -> list[TradeDocumentFreightLine]:
        return list((await self.session.execute(select(TradeDocumentFreightLine).where(
            TradeDocumentFreightLine.business_id == business_id, TradeDocumentFreightLine.document_id == document_id,
        ).order_by(TradeDocumentFreightLine.line_no))).scalars().all())

    async def replace_freight_lines(self, business_id: str, document_id: str,
                                    lines: list[TradeDocumentFreightLine]) -> None:
        await self.session.execute(delete(TradeDocumentFreightLine).where(
            TradeDocumentFreightLine.business_id == business_id, TradeDocumentFreightLine.document_id == document_id,
        ))
        self.session.add_all(lines)
        await self.session.flush()

    async def wht_base(self, business_id: str) -> str:
        return (await self.session.execute(_WHT_BASE, {"business_id": business_id})).scalar_one_or_none() or "gross"

    # ---------------------------------------------------------------- reads
    async def list_page(self, business_id: str, type_key: str, offset: int, limit: int,
                        party_id: str | None, search: str | None) -> tuple[list[Row], int, Decimal]:
        args = {"business_id": business_id, "type_key": type_key, "party_id": party_id, "search": search,
                "pattern": f"%{search}%" if search else None}
        totals = (await self.session.execute(_LIST_TOTALS, args)).one()
        rows = (await self.session.execute(_LIST_PAGE, {**args, "offset": offset, "limit": limit})).all()
        return list(rows), totals.total, totals.total_amount

    async def detail(self, business_id: str, document_id: str) -> Row:
        return (await self.session.execute(_DETAIL, {"business_id": business_id, "document_id": document_id})).one()

    async def line_rows(self, business_id: str, document_id: str) -> list[Row]:
        return list((await self.session.execute(
            _LINES, {"business_id": business_id, "document_id": document_id})).all())

    async def preview(self, lines: list[tuple], discount_type: str | None, inclusive: bool, dp: int) -> list[Row]:
        """(qty, unit price, discount, tax rate) per line -> (ord, net, tax), rounded like a posting."""
        if not lines:
            return []
        qty, price, discount, rate = (list(column) for column in zip(*lines))
        return list((await self.session.execute(_PREVIEW, {
            "qty": qty, "price": price, "discount": discount, "rate": rate,
            "discount_type": discount_type, "inclusive": inclusive, "dp": dp,
        })).all())

    async def rounding(self, method: str, gross: Decimal) -> Decimal:
        return (await self.session.execute(_ROUNDING, {"method": method, "gross": gross})).scalar_one()

    async def balances(self, business_id: str, ids: list[str] | None = None, party_id: str | None = None,
                       type_key: str = "sales_invoice") -> list[Row]:
        return list((await self.session.execute(_BALANCES, {
            "business_id": business_id, "ids": ids, "party_id": party_id, "type_key": type_key})).all())

    async def balance_total(self, business_id: str, party_id: str | None, type_key: str = "sales_invoice") -> Decimal:
        return (await self.session.execute(_BALANCE_TOTAL, {
            "business_id": business_id, "party_id": party_id, "type_key": type_key})).scalar_one()

    async def applications(self, business_id: str, invoice_id: str) -> list[Row]:
        return list((await self.session.execute(
            _APPLICATIONS, {"business_id": business_id, "invoice_id": invoice_id})).all())

    async def settled(self, business_id: str, document_id: str) -> list[Row]:
        return list((await self.session.execute(
            _SETTLED, {"business_id": business_id, "document_id": document_id})).all())

    async def links(self, business_id: str, ids: list[str]) -> list[Row]:
        if not ids:
            return []
        return list((await self.session.execute(_LINKS, {"business_id": business_id, "ids": ids})).all())

    async def late_fees_of(self, business_id: str, invoice_id: str) -> list[Row]:
        return list((await self.session.execute(
            _LATE_FEES_OF, {"business_id": business_id, "invoice_id": invoice_id})).all())

    async def lines_report(self, business_id: str, type_key: str, offset: int, limit: int) -> tuple[list[Row], int]:
        args = {"business_id": business_id, "type_key": type_key}
        total = (await self.session.execute(_LINES_REPORT_COUNT, args)).scalar_one()
        rows = (await self.session.execute(_LINES_REPORT, {**args, "offset": offset, "limit": limit})).all()
        return list(rows), total

    async def party_kind(self, business_id: str, party_id: str) -> str | None:
        return (await self.session.execute(
            _PARTY_KIND, {"business_id": business_id, "party_id": party_id})).scalar_one_or_none()

    async def has_right(self, business_id: str, area_key: str, right_key: str) -> bool:
        return bool((await self.session.execute(
            _HAS_RIGHT, {"business_id": business_id, "area_key": area_key, "right_key": right_key})).scalar())

    async def party_credits(self, business_id: str, party_id: str, control: str) -> list[Row]:
        return list((await self.session.execute(
            _PARTY_CREDITS, {"business_id": business_id, "party_id": party_id, "control": control})).all())

    async def ar_balance(self, business_id: str, party_id: str) -> Decimal:
        return (await self.session.execute(
            _AR_BALANCE, {"business_id": business_id, "party_id": party_id})).scalar_one()

    # ---------------------------------------------------------------- customers
    async def customer_summaries(self, business_id: str) -> dict[str, Row]:
        rows = await self.session.execute(_CUSTOMER_SUMMARIES, {"business_id": business_id})
        return {r.party_id: r for r in rows}

    async def supplier_summaries(self, business_id: str) -> dict[str, Row]:
        rows = await self.session.execute(_SUPPLIER_SUMMARIES, {"business_id": business_id})
        return {r.party_id: r for r in rows}

    async def customer_names(self, business_id: str) -> dict[str, str]:
        rows = await self.session.execute(_CUSTOMER_NAMES, {"business_id": business_id})
        return {r.id: r.name for r in rows}
