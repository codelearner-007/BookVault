"""Late payment fees (B4; PR-31, T37, T100, T101): Dr AR[customer, invoice] / Cr Late payment fees.

A fee belongs to one posted sales invoice and adds to its balance due. Proposals: for every
invoice with late-fee terms and a balance due, one charge date the day after the due date, then
monthly, up to the as-of date, skipping dates already charged; fee = rate x balance due. A charge
date in a locked period is proposed at the first open date (BV choice, flagged `locked`).
"""

import calendar
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, LedgerValidationError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.models.ledger import Document
from app.models.sales import LatePaymentFee
from app.repositories.coa_repository import CoaRepository
from app.repositories.late_fee_repository import LateFeeRepository
from app.repositories.sales_repository import SalesRepository
from app.schemas.request.sales import ConfirmLateFeesRequest, CreateLateFeeRequest, LateFeeFields, UpdateLateFeeRequest
from app.schemas.response.sales import (
    ConfirmLateFeesResponse,
    LateFeeListItem,
    LateFeeListResponse,
    LateFeeProposal,
    LateFeeProposalsResponse,
    LateFeeResponse,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.posting import DRAFT, POSTED, VOID, DocumentHeader, LineInput, PostingService
from app.services.sales_rules import HUNDRED
from app.services.versioning import check_version

TYPE, AREA, ENTITY = "late_payment_fee", "late_payment_fees", "LatePaymentFee"
AR, FEES = "accounts_receivable", "late_payment_fees"
ZERO = Decimal(0)


def add_months(start: date, months: int) -> date:
    month = start.month - 1 + months
    year, month = start.year + month // 12, month % 12 + 1
    return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))


def charge_dates(due_date: date, as_of: date) -> list[date]:
    """The day after the due date, then monthly, up to as_of (PR-31, T100: 2026-10-09)."""
    first, dates = due_date + timedelta(days=1), []
    while (when := add_months(first, len(dates))) <= as_of:
        dates.append(when)
    return dates


class LatePaymentFeeService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = LateFeeRepository(session)
        self.sales = SalesRepository(session)
        self.coa = CoaRepository(session)
        self.posting = PostingService(session)
        self.audit = AuditService(session)

    # ---------------------------------------------------------------- reads
    async def list_page(self, business_id: str, params: PageParams) -> LateFeeListResponse:
        dp = await self.posting.decimals(business_id)
        rows, total, amount = await self.repo.list_page(business_id, params.offset, params.page_size)
        items = [LateFeeListItem.model_validate({**r._mapping, "amount": round_money(r.amount, dp)}) for r in rows]
        return LateFeeListResponse.build(items, total, params.page, params.page_size,
                                         total_amount=round_money(amount, dp))

    async def get(self, business_id: str, document_id: str) -> LateFeeResponse:
        return await self._response(await self._document(business_id, document_id))

    async def proposals(self, business_id: str, as_of: date, params: PageParams) -> LateFeeProposalsResponse:
        rows = await self._proposals(business_id, as_of)
        return LateFeeProposalsResponse.build(params.slice(rows), len(rows), params.page, params.page_size)

    async def _proposals(self, business_id: str, as_of: date) -> list[LateFeeProposal]:
        dp = await self.posting.decimals(business_id)
        lock = await self.posting.lock_date(business_id)
        charged = await self.repo.charged_dates(business_id)
        names = await self.sales.customer_names(business_id)
        found = []
        for invoice in await self.sales.balances(business_id):
            if invoice.late_fee_rate is None or invoice.balance_due <= 0:
                continue
            amount = round_money(invoice.balance_due * invoice.late_fee_rate / HUNDRED, dp)
            for when in charge_dates(invoice.due_date, as_of):
                if (invoice.invoice_id, when) in charged or amount <= 0:
                    continue
                locked = lock is not None and when <= lock
                found.append(LateFeeProposal(
                    invoice_id=invoice.invoice_id, invoice_reference=invoice.reference,
                    customer_id=invoice.party_id, customer_name=names.get(invoice.party_id), charge_date=when,
                    post_date=lock + timedelta(days=1) if locked else when,
                    balance_due=round_money(invoice.balance_due, dp), rate=invoice.late_fee_rate, amount=amount,
                    locked=locked))
        return sorted(found, key=lambda p: (p.charge_date, p.invoice_reference or ""))

    # ---------------------------------------------------------------- writes
    async def create(self, ctx: BusinessContext, body: CreateLateFeeRequest) -> LateFeeResponse:
        await self._check_invoice(ctx.business_id, body)
        document = await self.posting.create_header(ctx, TYPE, AREA, _header(body), POSTED if body.post else DRAFT)
        await self.repo.add(LatePaymentFee(document_id=document.id, business_id=ctx.business_id,
                                           invoice_document_id=body.invoice_id, amount=body.amount))
        if body.post:
            await self._post(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "create", ENTITY, document.id, ctx.business_id, after=after)
        return after

    async def confirm(self, ctx: BusinessContext, body: ConfirmLateFeesRequest) -> ConfirmLateFeesResponse:
        """Batch: one posted fee per chosen proposal, dated its charge date (or the first open date)."""
        latest = max(x.charge_date for x in body.items)
        proposals = {(p.invoice_id, p.charge_date): p for p in await self._proposals(ctx.business_id, latest)}
        created = []
        for item in body.items:
            proposal = proposals.get((item.invoice_id, item.charge_date))
            if proposal is None:
                raise LedgerValidationError("This late payment fee is not due or already charged", "fee_not_due")
            created.append(await self.create(ctx, CreateLateFeeRequest(
                date=proposal.post_date, customer_id=proposal.customer_id, invoice_id=proposal.invoice_id,
                amount=proposal.amount, post=True)))
        return ConfirmLateFeesResponse(created=created)

    async def update(self, ctx: BusinessContext, document_id: str, body: UpdateLateFeeRequest) -> LateFeeResponse:
        document = await self._writable(ctx, document_id, body.version)
        before = await self._response(document)
        await self._check_invoice(ctx.business_id, body)
        await self.posting.update_header(ctx, document, _header(body))
        fee = await self.repo.get(ctx.business_id, document.id)
        fee.invoice_document_id, fee.amount = body.invoice_id, body.amount
        await self.repo.save()
        if before.status == POSTED:
            await self.posting.reverse_live_entry(ctx, document)
            await self._post(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "update", ENTITY, document.id, ctx.business_id, before=before, after=after)
        return after

    async def post(self, ctx: BusinessContext, document_id: str, version: int) -> LateFeeResponse:
        document = await self._writable(ctx, document_id, version)
        if await self.posting.status_of(document) != DRAFT:
            raise ConflictError("Only a draft can be posted", "document_not_draft")
        before = await self._response(document)
        await self.posting.set_status(ctx, document, POSTED)
        await self._post(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "post", ENTITY, document.id, ctx.business_id, before=before, after=after)
        return after

    async def void(self, ctx: BusinessContext, document_id: str, version: int) -> LateFeeResponse:
        document = await self._writable(ctx, document_id, version)
        before = await self._response(document)
        await self.posting.void(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "void", ENTITY, document.id, ctx.business_id, before=before, after=after)
        return after

    # ---------------------------------------------------------------- helpers
    async def _post(self, ctx: BusinessContext, document: Document) -> None:
        fee = await self.repo.get(ctx.business_id, document.id)
        party_id = (await self.sales.get(ctx.business_id, fee.invoice_document_id)).party_id
        ar = await self.coa.system_account_id(ctx.business_id, AR)
        income = await self.coa.system_account_id(ctx.business_id, FEES)
        await self.posting.post_lines(ctx, document, [
            LineInput(ar, fee.amount, ZERO, party_id=party_id, invoice_document_id=fee.invoice_document_id),
            LineInput(income, ZERO, fee.amount)])

    async def _check_invoice(self, business_id: str, body: LateFeeFields) -> None:
        rows = await self.sales.balances(business_id, [body.invoice_id]) if is_uuid(body.invoice_id) else []
        if not rows or rows[0].party_id != body.customer_id:
            raise LedgerValidationError("Choose a posted sales invoice of this customer", "invalid_invoice")

    async def _document(self, business_id: str, document_id: str, *, for_update: bool = False) -> Document:
        document = None
        if is_uuid(document_id):
            document = await self.posting.get_document(business_id, document_id, TYPE, for_update=for_update)
        if document is None:
            raise ResourceNotFoundError(ENTITY, document_id)
        return document

    async def _writable(self, ctx: BusinessContext, document_id: str, version: int) -> Document:
        document = await self._document(ctx.business_id, document_id, for_update=True)
        check_version(document, version)
        if await self.posting.status_of(document) == VOID:
            raise ConflictError("A void document cannot be changed", "document_void")
        return document

    async def _response(self, document: Document) -> LateFeeResponse:
        dp = await self.posting.decimals(document.business_id)
        row = await self.repo.detail(document.business_id, document.id)
        return LateFeeResponse(
            id=document.id, reference=document.reference, date=document.document_date,
            status=await self.posting.status_of(document), version=document.version,
            is_locked=await self.posting.is_locked(document), customer_id=row.customer_id,
            customer_name=row.customer_name, invoice_id=row.invoice_id, invoice_reference=row.invoice_reference,
            amount=round_money(row.amount, dp), description=document.description,
            created_at=document.created_at, updated_at=document.updated_at)


def _header(body: LateFeeFields) -> DocumentHeader:
    return DocumentHeader(body.date, body.reference, body.description)
