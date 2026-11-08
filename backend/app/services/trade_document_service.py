"""Sales quotes, orders, invoices, credit notes and delivery notes (B4): one service, per-type rules.

Flow (story): validate the form -> store document, extension and lines -> on post, read the
amounts back from the database views and post the ledger image (invoices, credit notes) ->
audit. Drafts never reach the ledger; an edit of a posted posting document is reversal + new
entry (PR-73); void = reversal (PR-74). Lines snapshot the tax rate and account (BUG-08).
Starting-balance invoices (PR-61, D-36) post no revenue line, only their own opening balance.
"""

from datetime import date
from decimal import Decimal, InvalidOperation

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, LedgerValidationError, PermissionDeniedError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.models.customer import Customer
from app.models.ledger import Document
from app.models.sales import InvoiceTerms, TradeDocument, TradeDocumentLine
from app.repositories.business_settings_repository import BusinessSettingsRepository
from app.repositories.coa_repository import CoaRepository
from app.repositories.master_data_repository import MasterDataRepository
from app.repositories.sales_repository import SalesRepository
from app.schemas.request.sales import TradeTotalsRequest
from app.schemas.response.sales import (
    CopyToResponse,
    DocumentWarning,
    TradeDocumentListResponse,
    TradeDocumentResponse,
    TradeLineReportItem,
    TradeLineReportResponse,
    TradeTotalsLine,
    TradeTotalsResponse,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.invoice_opening_service import InvoiceOpeningService
from app.services.posting import DRAFT, POSTED, VOID, DocumentHeader, PostingService
from app.services.trade_ledger import TradeLedger
from app.services.trade_types import CREDIT_NOTE, CREDIT_NOTE_LINK, DELIVERY_NOTE, INVOICE, TRADE_TYPES, TradeType
from app.services.trade_view import TradeView, linked_invoice, tax_breakdown
from app.services.versioning import check_version

CUSTOMER = "customer"
STARTING_BALANCES_AREA = "settings.starting_balances"


class TradeDocumentService:
    def __init__(self, session: AsyncSession, kind: TradeType) -> None:
        self.kind = kind
        self.repo = SalesRepository(session)
        self.master = MasterDataRepository(session)
        self.posting = PostingService(session)
        self.coa = CoaRepository(session)
        self.settings = BusinessSettingsRepository(session)
        self.openings = InvoiceOpeningService(session)
        self.ledger = TradeLedger(self.repo, self.posting, self.coa)
        self.view = TradeView(self.repo, self.posting)
        self.audit = AuditService(session)
        self.session = session

    # ---------------------------------------------------------------- reads
    async def list_page(self, business_id: str, params: PageParams, customer_id: str | None,
                        search: str | None) -> TradeDocumentListResponse:
        dp = await self.posting.decimals(business_id)
        rows, total, amount = await self.repo.list_page(business_id, self.kind.key, params.offset, params.page_size,
                                                        customer_id, search)
        extra = {}
        if self.kind.key == INVOICE:
            extra["total_balance_due"] = round_money(await self.repo.balance_total(business_id, customer_id), dp)
        return TradeDocumentListResponse.build(await self.view.list_items(self.kind, business_id, rows), total,
                                               params.page, params.page_size, total_amount=round_money(amount, dp),
                                               **extra)

    async def get(self, business_id: str, document_id: str) -> TradeDocumentResponse:
        return await self.view.response(self.kind, await self._document(business_id, document_id))

    async def totals(self, business_id: str, body: TradeTotalsRequest) -> TradeTotalsResponse:
        dp = await self.posting.decimals(business_id)
        rates = await self._tax_rows(business_id, {x.tax_code_id for x in body.lines if x.tax_code_id})
        rows = await self.repo.preview(
            [(x.qty, x.unit_price, x.discount, rates[x.tax_code_id].rate if x.tax_code_id else None)
             for x in body.lines], body.discount_type, body.amounts_include_tax, dp)
        gross = sum((r.net + r.tax for r in rows), round_money(Decimal(0), dp))
        rounding = await self.repo.rounding(body.rounding, gross)
        breakdown_rows = [_TaxRow(x.tax_code_id, rates[x.tax_code_id].name, rates[x.tax_code_id].rate, r.tax)
                          for x, r in zip(body.lines, rows) if x.tax_code_id]
        return TradeTotalsResponse(
            lines=[TradeTotalsLine(net=r.net, tax=r.tax, total=r.net + r.tax) for r in rows],
            subtotal=sum((r.net for r in rows), round_money(Decimal(0), dp)), tax_total=sum((r.tax for r in rows),
                                                                                    round_money(Decimal(0), dp)),
            rounding=round_money(rounding, dp), total=round_money(gross + rounding, dp),
            tax_breakdown=tax_breakdown(breakdown_rows, dp))

    async def lines_report(self, business_id: str, params: PageParams) -> TradeLineReportResponse:
        dp = await self.posting.decimals(business_id)
        rows, total = await self.repo.lines_report(business_id, self.kind.key, params.offset, params.page_size)
        items = [TradeLineReportItem.model_validate({**r._mapping, "net": round_money(r.net, dp),
                                                     "tax": round_money(r.tax, dp)}) for r in rows]
        return TradeLineReportResponse.build(items, total, params.page, params.page_size)

    async def copy_to(self, business_id: str, document_id: str, target: str) -> CopyToResponse:
        """A prefilled create body for the target form (quote -> order/invoice, order -> invoice/delivery
        note, invoice -> credit note); saving it with source_document_id records the link."""
        if target not in self.kind.copy_to:
            raise LedgerValidationError("This document cannot be copied to that type", "copy_not_allowed")
        source = await self.get(business_id, document_id)
        if source.status != POSTED:
            raise ConflictError("Only a posted document can be copied", "document_not_posted")
        prefill = {"date": date.today().isoformat(), "customer_id": source.customer_id,
                   "description": source.description, "source_document_id": source.id}
        if target == DELIVERY_NOTE:
            prefill["lines"] = [{"item_id": x.item_id, "description": x.description, "qty": str(x.qty or 1)}
                                for x in source.lines if x.item_id]
        else:
            prefill.update(billing_address=source.billing_address, amounts_include_tax=source.amounts_include_tax,
                           discount_type=source.discount_type, lines=[
                               {"item_id": x.item_id, "account_id": x.account_id, "description": x.description,
                                "qty": str(x.qty) if x.qty is not None else None, "unit_price": str(x.unit_price),
                                "discount": str(x.discount) if x.discount is not None else None,
                                "tax_code_id": x.tax_code_id} for x in source.lines])
        if target == CREDIT_NOTE:
            prefill["invoice_id"] = source.id
        return CopyToResponse(target_type=target, prefill=prefill)

    # ---------------------------------------------------------------- writes
    async def create(self, ctx: BusinessContext, body) -> TradeDocumentResponse:
        customer = await self._customer(ctx.business_id, body.customer_id)
        starting = await self._check_starting_balance(ctx, body)
        lines = await self._lines(ctx.business_id, body)
        document = await self.posting.create_header(ctx, self.kind.key, self.kind.area, _header(body),
                                                    POSTED if body.post else DRAFT, starting_balance=starting)
        await self.repo.add(self._extension(document, body, customer))
        if self.kind.key == INVOICE:
            await self.repo.add(InvoiceTerms(document_id=document.id, business_id=ctx.business_id,
                                             **_terms(body)))
        await self._store_lines(document, lines)
        await self._link_source(ctx, document, body)
        warnings = await self._post(ctx, document, body) if body.post else []
        after = await self.view.response(self.kind, document, warnings)
        await self.audit.record(ctx.user_id, "create", self.kind.entity, document.id, ctx.business_id, after=after,
                                details=_warning_details(warnings))
        return after

    async def update(self, ctx: BusinessContext, document_id: str, body) -> TradeDocumentResponse:
        document = await self._writable(ctx, document_id, body.version)
        before = await self.view.response(self.kind, document)
        customer = await self._customer(ctx.business_id, body.customer_id)
        posted = before.status == POSTED
        if posted and before.is_locked and _only_descriptions(before, body):
            await self.posting.update_descriptions(ctx, document, body.description)
            for stored, wanted in zip(await self.repo.lines(ctx.business_id, document.id), body.lines):
                stored.description = wanted.description
            await self.repo.save()
            return await self._audited_update(ctx, document, before, [])
        starting = await self._check_starting_balance(ctx, body, before)
        lines = await self._lines(ctx.business_id, body)
        await self.posting.update_header(ctx, document, _header(body), starting_balance=starting)
        await self._apply_extension(document, body, customer)
        await self._store_lines(document, lines)
        await self._relink_invoice(ctx, document, body)
        warnings = []
        if posted and (self.kind.posts or starting):
            await self.posting.reverse_live_entry(ctx, document)
            warnings = await self._post(ctx, document, body)
            await self._assert_not_below_applied(document)
        return await self._audited_update(ctx, document, before, warnings)

    async def _assert_not_below_applied(self, document: Document) -> None:
        """INV-3: an edit may not take an invoice below what receipts and credit notes already settled."""
        if self.kind.key != INVOICE:
            return
        balance = next(iter(await self.repo.balances(document.business_id, [document.id])), None)
        if balance is not None and balance.balance_due < 0:
            raise ConflictError("The new total is less than what is already applied to this invoice",
                                "invoice_below_applied")

    async def post(self, ctx: BusinessContext, document_id: str, version: int,
                   credit_limit_override: bool = False) -> TradeDocumentResponse:
        document = await self._writable(ctx, document_id, version)
        if await self.posting.status_of(document) != DRAFT:
            raise ConflictError("Only a draft can be posted", "document_not_draft")
        before = await self.view.response(self.kind, document)
        await self.posting.set_status(ctx, document, POSTED)
        warnings = await self._post(ctx, document, _PostOptions(credit_limit_override, before.paid_before_start))
        after = await self.view.response(self.kind, document, warnings)
        await self.audit.record(ctx.user_id, "post", self.kind.entity, document.id, ctx.business_id,
                                before=before, after=after, details=_warning_details(warnings))
        return after

    async def void(self, ctx: BusinessContext, document_id: str, version: int) -> TradeDocumentResponse:
        """PR-74: reversal + void. An invoice must first lose its receipts, credit notes and fees."""
        document = await self._writable(ctx, document_id, version)
        before = await self.view.response(self.kind, document)
        if self.kind.key == INVOICE:
            settled = [a for a in before.applied if a.document_type != "opening_balance"]
            if settled or before.late_fees:
                raise ConflictError("Void the receipts, credit notes and late fees applied to this invoice first",
                                    "invoice_has_payments")
            if before.is_starting_balance:
                await self.openings.void_opening(ctx, document.id)
        await self.posting.void(ctx, document)
        after = await self.view.response(self.kind, document)
        await self.audit.record(ctx.user_id, "void", self.kind.entity, document.id, ctx.business_id,
                                before=before, after=after)
        return after

    # ---------------------------------------------------------------- posting
    async def _post(self, ctx: BusinessContext, document: Document, body) -> list[DocumentWarning]:
        """The ledger effect of a posted document (none for quotes, orders, delivery notes)."""
        extension = await self.repo.get(ctx.business_id, document.id)
        dp = await self.posting.decimals(ctx.business_id)
        if self.kind.key == INVOICE:
            terms = await self.repo.terms(ctx.business_id, document.id)
            if terms.is_starting_balance:
                paid = body.paid_before_start
                if paid is None and (live := await self.openings.openings.live_invoice_opening(
                        ctx.business_id, document.id)):
                    paid = live.paid_before_start
                await self.openings.set_opening(ctx, document, paid)
                return []
            customer = await self._customer(ctx.business_id, extension.party_id)
            policy = (await self.settings.get(ctx.business_id)).credit_limit_policy_key
            warnings = await self.ledger.check_credit_limit(customer, document, policy, body.credit_limit_override, dp)
            await self.posting.post_lines(ctx, document, await self.ledger.invoice_lines(document, extension.party_id))
            return warnings
        if self.kind.key == CREDIT_NOTE:
            await self.posting.replace_allocations(ctx, document, [])
            link = linked_invoice(await self.repo.links(ctx.business_id, [document.id]), document.id)
            lines, allocations = await self.ledger.credit_note(document, extension.party_id,
                                                               link.from_id if link else None, dp)
            await self.posting.post_lines(ctx, document, lines)
            await self.posting.replace_allocations(ctx, document, allocations)
        return []

    # ---------------------------------------------------------------- validation
    async def _customer(self, business_id: str, customer_id: str) -> Customer:
        customer = (await self.session.get(Customer, customer_id)) if is_uuid(customer_id) else None
        if customer is None or customer.business_id != business_id:
            raise LedgerValidationError("Choose a customer of this business", "customer_required")
        return customer

    async def _check_starting_balance(self, ctx: BusinessContext, body, before=None) -> bool:
        """PR-61 / D-36: the only documents dated before the books start, flagged explicitly."""
        flagged = getattr(body, "is_starting_balance", False) or bool(before and before.is_starting_balance)
        if not flagged:
            return False
        if not await self.repo.has_right(ctx.business_id, STARTING_BALANCES_AREA, "edit"):
            raise PermissionDeniedError(f"{STARTING_BALANCES_AREA}:edit")
        if body.date >= await self.posting.books_start_date(ctx.business_id):
            raise LedgerValidationError("A starting-balance invoice is dated before the books start date",
                                        "starting_balance_after_start")
        return True

    async def _tax_rows(self, business_id: str, ids: set[str]) -> dict:
        rows = await self.master.tax_code_rows(business_id, ids) if ids else {}
        if set(rows) != ids:
            raise LedgerValidationError("Tax code not found in this business", "invalid_tax_code")
        return rows

    async def _lines(self, business_id: str, body) -> list[TradeDocumentLine]:
        """Typed lines with the item's account and the tax code's rate and account as snapshots."""
        items = await self.master.items(business_id, {x.item_id for x in body.lines if x.item_id})
        if any(x.item_id and x.item_id not in items for x in body.lines):
            raise LedgerValidationError("Item not found in this business", "invalid_item")
        if not self.kind.priced:
            return [TradeDocumentLine(business_id=business_id, line_no=no, item_id=x.item_id,
                                      description=x.description, qty=x.qty, unit_price=0)
                    for no, x in enumerate(body.lines, start=1)]
        rates = await self._tax_rows(business_id, {x.tax_code_id for x in body.lines if x.tax_code_id})
        lines = []
        for no, x in enumerate(body.lines, start=1):
            account_id = x.account_id or (items[x.item_id].income_account_id if x.item_id else None)
            if self.kind.needs_accounts and account_id is None:
                raise LedgerValidationError("Every line needs an account", "account_required")
            tax = rates.get(x.tax_code_id) if x.tax_code_id else None
            lines.append(TradeDocumentLine(
                business_id=business_id, line_no=no, item_id=x.item_id, account_id=account_id,
                description=x.description, qty=x.qty, unit_price=x.unit_price, discount=x.discount,
                tax_code_id=x.tax_code_id, tax_rate=tax.rate if tax else None,
                tax_account_id=tax.account_id if tax else None))
        accounts = {x.account_id for x in lines if x.account_id}
        found = await self.master.account_types(business_id, accounts)
        if set(found) != accounts or any(not a.is_active for a in found.values()):
            raise LedgerValidationError("Every line needs an active account of this business", "invalid_account")
        return lines

    async def _source(self, business_id: str, source_id: str, customer_id: str):
        source = await self.repo.get(business_id, source_id) if is_uuid(source_id) else None
        document = await self.posting.repo.get_document(business_id, source_id) if source else None
        if document is None or source.party_id != customer_id:
            raise LedgerValidationError("The source document is not one of this customer's", "invalid_source")
        type_key = await self.posting.repo.document_type_key(document.document_type_id)
        return document, type_key

    async def _link_source(self, ctx: BusinessContext, document: Document, body) -> None:
        source_id = getattr(body, "source_document_id", None) or getattr(body, "invoice_id", None)
        if source_id is None:
            return
        source, type_key = await self._source(ctx.business_id, source_id, body.customer_id)
        link_type = TRADE_TYPES[type_key].copy_to.get(self.kind.key) if type_key in TRADE_TYPES else None
        if link_type is None or await self.posting.status_of(source) != POSTED:
            raise LedgerValidationError("This document cannot be created from that source", "invalid_source")
        await self.posting.link(ctx, source.id, document, link_type)

    async def _relink_invoice(self, ctx: BusinessContext, document: Document, body) -> None:
        """A credit note may be moved to another invoice of its customer (or to Automatic)."""
        if self.kind.key != CREDIT_NOTE:
            return
        current = linked_invoice(await self.repo.links(ctx.business_id, [document.id]), document.id)
        if (current.from_id if current else None) == body.invoice_id:
            return
        await self.posting.unlink(ctx, document, CREDIT_NOTE_LINK)
        await self._link_source(ctx, document, body)

    # ---------------------------------------------------------------- storage helpers
    def _extension(self, document: Document, body, customer: Customer) -> TradeDocument:
        extension = TradeDocument(document_id=document.id, business_id=document.business_id, party_id=customer.id)
        _apply(extension, body)
        return extension

    async def _apply_extension(self, document: Document, body, customer: Customer) -> None:
        extension = await self.repo.get(document.business_id, document.id)
        extension.party_id = customer.id
        _apply(extension, body)
        if self.kind.key == INVOICE:
            terms = await self.repo.terms(document.business_id, document.id)
            for key, value in _terms(body).items():
                setattr(terms, key, value)
        await self.repo.save()

    async def _store_lines(self, document: Document, lines: list[TradeDocumentLine]) -> None:
        for line in lines:
            line.document_id = document.id
        await self.repo.replace_lines(document.business_id, document.id, lines)

    async def _document(self, business_id: str, document_id: str, *, for_update: bool = False) -> Document:
        document = None
        if is_uuid(document_id):
            document = await self.posting.get_document(business_id, document_id, self.kind.key, for_update=for_update)
        if document is None:
            raise ResourceNotFoundError(self.kind.entity, document_id)
        return document

    async def _writable(self, ctx: BusinessContext, document_id: str, version: int) -> Document:
        document = await self._document(ctx.business_id, document_id, for_update=True)
        check_version(document, version)
        if await self.posting.status_of(document) == VOID:
            raise ConflictError("A void document cannot be changed", "document_void")
        return document

    async def _audited_update(self, ctx: BusinessContext, document: Document, before,
                              warnings: list[DocumentWarning]) -> TradeDocumentResponse:
        after = await self.view.response(self.kind, document, warnings)
        await self.audit.record(ctx.user_id, "update", self.kind.entity, document.id, ctx.business_id,
                                before=before, after=after, details=_warning_details(warnings))
        return after


class _TaxRow:
    """A preview line in the shape tax_breakdown() reads."""

    def __init__(self, tax_code_id: str, name: str, rate, tax) -> None:
        self.tax_code_id, self.tax_code_name, self.tax_rate, self.tax = tax_code_id, name, rate, tax


class _PostOptions:
    def __init__(self, credit_limit_override: bool, paid_before_start) -> None:
        self.credit_limit_override = credit_limit_override
        self.paid_before_start = paid_before_start


def _header(body) -> DocumentHeader:
    return DocumentHeader(body.date, body.reference, body.description)


def _apply(extension: TradeDocument, body) -> None:
    extension.billing_address = getattr(body, "billing_address", None)
    extension.delivery_address = getattr(body, "delivery_address", None)
    extension.amounts_include_tax = getattr(body, "amounts_include_tax", False)
    extension.discount_type_key = getattr(body, "discount_type", None)
    extension.expiry_date = getattr(body, "expiry_date", None)


def _terms(body) -> dict:
    return {
        "due_date": body.due_date or body.date, "rounding_method_key": body.rounding,
        "early_discount_rate": body.early_discount_rate, "early_discount_days": body.early_discount_days,
        "late_fee_rate": body.late_fee_rate, "is_starting_balance": body.is_starting_balance,
    }


def _only_descriptions(before: TradeDocumentResponse, body) -> bool:
    """A locked document accepts description edits only (PR-75)."""
    lines = [(x.item_id, x.account_id, x.qty, x.unit_price, x.discount, x.tax_code_id) for x in before.lines]
    wanted = [(x.item_id, getattr(x, "account_id", None) or next(
        (b.account_id for b in before.lines if b.item_id == x.item_id), None), x.qty,
        getattr(x, "unit_price", 0), getattr(x, "discount", None), getattr(x, "tax_code_id", None))
        for x in body.lines]
    return before.date == body.date and before.customer_id == body.customer_id and len(lines) == len(wanted) \
        and all(_same(a, b) for a, b in zip(lines, wanted))


def _same(stored: tuple, wanted: tuple) -> bool:
    return all((a is None and b is None) or (a is not None and b is not None and str(a) == str(b)) or
               (a is not None and b is not None and _num(a) == _num(b)) for a, b in zip(stored, wanted))


def _num(value):
    try:
        return Decimal(str(value))
    except InvalidOperation:  # ids compare as strings in _same
        return value


def _warning_details(warnings: list[DocumentWarning]) -> dict | None:
    return {"warnings": [w.code for w in warnings], "credit_limit_override": True} if warnings else None

