"""Starting-balance sales invoices (PR-61, D-36; domain-model §3.5): their own opening balance.

A starting-balance invoice posts no revenue or tax line. Its opening document (kind
sales_invoice) carries Dr Accounts receivable[customer, invoice] (total - paid before start) /
Cr Retained earnings, dated books_start_date - 1 (no entry when that is 0), and the amount paid
before the start as an allocation, so balance due = total - allocations as for every invoice.
Changing it = void the opening document + a new one (audited by the caller).
"""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import LedgerValidationError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.models.ledger import Document
from app.repositories.coa_repository import CoaRepository
from app.repositories.opening_balance_repository import OpeningBalanceRepository
from app.repositories.sales_repository import SalesRepository
from app.schemas.response.sales import InvoiceStartingBalanceItem, InvoiceStartingBalancesResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.posting import (
    OPENING_BALANCE,
    POSTED,
    SOURCE_OPENING,
    Allocation,
    DocumentHeader,
    LineInput,
    PostingService,
)

AREA = "settings.starting_balances"
KIND = "sales_invoice"
AR, RETAINED_EARNINGS = "accounts_receivable", "retained_earnings"
ENTITY = "StartingBalance"
ZERO = Decimal(0)


class InvoiceOpeningService:
    def __init__(self, session: AsyncSession) -> None:
        self.posting = PostingService(session)
        self.openings = OpeningBalanceRepository(session)
        self.sales = SalesRepository(session)
        self.coa = CoaRepository(session)
        self.audit = AuditService(session)

    async def set_opening(self, ctx: BusinessContext, invoice: Document, paid_before_start: Decimal | None,
                          on: date | None = None) -> None:
        await self.void_opening(ctx, invoice.id)
        dp = await self.posting.decimals(ctx.business_id)
        paid = round_money(paid_before_start or ZERO, dp)
        total = (await self.sales.detail(ctx.business_id, invoice.id)).total
        if paid > total:
            raise LedgerValidationError("Paid before start cannot exceed the invoice total", "paid_exceeds_total")
        party_id = (await self.sales.get(ctx.business_id, invoice.id)).party_id
        on = on or await self.posting.books_start_date(ctx.business_id)
        outstanding = total - paid
        lines = []
        if outstanding > 0:
            ar = await self.coa.system_account_id(ctx.business_id, AR)
            plug = await self.coa.system_account_id(ctx.business_id, RETAINED_EARNINGS)
            lines = [LineInput(ar, outstanding, ZERO, party_id=party_id, invoice_document_id=invoice.id),
                     LineInput(plug, ZERO, outstanding)]
        document = await self.posting.create_document(
            ctx, OPENING_BALANCE, AREA, DocumentHeader(on - timedelta(days=1), None, None), lines, POSTED)
        if lines:
            await self.posting.post(ctx, document, SOURCE_OPENING)
        await self.posting.link_opening_balance(ctx, document, KIND, invoice_document_id=invoice.id,
                                                paid_before_start=paid)
        await self.posting.replace_allocations(ctx, document, [Allocation(invoice.id, paid)])

    async def void_opening(self, ctx: BusinessContext, invoice_id: str) -> None:
        live = await self.openings.live_invoice_opening(ctx.business_id, invoice_id)
        if live is not None:
            document = await self.posting.get_document(ctx.business_id, live.document_id, OPENING_BALANCE,
                                                       for_update=True)
            await self.posting.void(ctx, document)

    async def redate(self, ctx: BusinessContext, new_start: date) -> None:
        """Books start moved: every starting-balance invoice must still precede it; re-post each opening."""
        if await self.openings.starting_balance_invoices_on_or_after(ctx.business_id, new_start):
            raise LedgerValidationError("Starting-balance invoices must be dated before the books start date",
                                        "starting_balance_after_start")
        for row in await self.openings.live_invoice_openings(ctx.business_id):
            invoice = await self.posting.get_document(ctx.business_id, row.invoice_id, "sales_invoice")
            await self.set_opening(ctx, invoice, row.paid_before_start, new_start)

    # ---------------------------------------------------------------- the Starting balances page
    async def list_page(self, business_id: str, params: PageParams) -> InvoiceStartingBalancesResponse:
        dp = await self.posting.decimals(business_id)
        rows, total = await self.openings.starting_balance_invoices(business_id, params.offset, params.page_size)
        start = await self.posting.books_start_date(business_id)
        return InvoiceStartingBalancesResponse.build(
            [self._item(r, dp) for r in rows], total, params.page, params.page_size,
            books_start_date=start, opening_date=start - timedelta(days=1))

    @staticmethod
    def _item(row, dp: int) -> InvoiceStartingBalanceItem:
        paid = row.paid_before_start or ZERO
        return InvoiceStartingBalanceItem(
            invoice_id=row.invoice_id, reference=row.reference, date=row.date, customer_id=row.customer_id,
            customer_name=row.customer_name, total=round_money(row.total, dp), paid_before_start=round_money(paid, dp),
            outstanding=round_money(row.total - paid, dp), document_id=row.document_id)

    async def set_paid(self, ctx: BusinessContext, invoice_id: str, paid: Decimal) -> InvoiceStartingBalanceItem:
        row = await self.openings.starting_balance_invoice(ctx.business_id, invoice_id) if is_uuid(invoice_id) else None
        if row is None:
            raise ResourceNotFoundError("StartingBalanceInvoice", invoice_id)
        dp = await self.posting.decimals(ctx.business_id)
        before = self._item(row, dp)
        invoice = await self.posting.get_document(ctx.business_id, invoice_id, "sales_invoice", for_update=True)
        await self.set_opening(ctx, invoice, paid)
        after = self._item(await self.openings.starting_balance_invoice(ctx.business_id, invoice_id), dp)
        await self.audit.record(ctx.user_id, "set", ENTITY, invoice_id, ctx.business_id, before=before, after=after)
        return after
