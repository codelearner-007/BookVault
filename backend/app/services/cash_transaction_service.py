"""Receipts and payments (B3, PR-01, PR-06, PR-07, PR-12): one service, two directions.

A receipt posts Dr Cash & cash equivalents[bank] total / Cr each line account; a payment the
mirror image. Without a bank or cash account the bank side posts to Suspense (PR-78); picking an
account later is an ordinary edit (reversal + repost). Line amounts and totals are computed here (AC-22); drafts never reach the
ledger; an edit of a posted document that changes its ledger image is a reversal plus a new
entry (PR-73); void = reversal (PR-74). Clear dates (PR-12) never touch the ledger.
"""

from dataclasses import dataclass, replace
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, LedgerValidationError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.models.bank_account import BankAccount
from app.models.banking import CashTransaction, CashTransactionLine
from app.models.ledger import Document
from app.repositories.bank_account_repository import BankAccountRepository
from app.repositories.cash_transaction_repository import CashTransactionRepository
from app.repositories.coa_repository import CoaRepository
from app.schemas.request.cash_transaction import (
    CashTransactionFields,
    CreateCashTransactionRequest,
    LineAmountsIn,
    UpdateCashTransactionRequest,
)
from app.schemas.response.cash_transaction import (
    AllocationResponse,
    CashLineReportItem,
    CashLineReportResponse,
    CashLineResponse,
    CashTotalsResponse,
    CashTransactionListItem,
    CashTransactionListResponse,
    CashTransactionResponse,
    LineAmountResponse,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.posting import DRAFT, POSTED, VOID, DocumentHeader, LineInput, PostingService
from app.services.receipt_settlement import ReceiptSettlement
from app.services.versioning import check_version

RECEIPT, PAYMENT = "receipt", "payment"
AREAS = {RECEIPT: "receipts", PAYMENT: "payments"}
ENTITIES = {RECEIPT: "Receipt", PAYMENT: "Payment"}
CASH_CONTROL, SUSPENSE = "cash_control", "suspense"
COUNTERPARTY_KINDS = {"customer", "supplier", "capital_account"}
ZERO = Decimal(0)


def line_amount(line, dp: int) -> Decimal:
    """round(qty x unit price) - discount; qty defaults to 1 (posting-rules §1)."""
    qty = line.qty if line.qty is not None else Decimal(1)
    return round_money(qty * line.unit_price, dp) - round_money(line.discount or ZERO, dp)


@dataclass(frozen=True)
class Prepared:
    """A validated form: its lines to store, their amounts and the ledger image."""

    lines: list[CashTransactionLine]
    amounts: list[Decimal]
    ledger: list[LineInput]

    @property
    def total(self) -> Decimal:
        return sum(self.amounts, ZERO)


class CashTransactionService:
    def __init__(self, session: AsyncSession, direction: str) -> None:
        self.direction = direction
        self.area = AREAS[direction]
        self.entity = ENTITIES[direction]
        self.repo = CashTransactionRepository(session)
        self.banks = BankAccountRepository(session)
        self.coa = CoaRepository(session)
        self.posting = PostingService(session)
        self.settlement = ReceiptSettlement(session)
        self.audit = AuditService(session)

    # ---------------------------------------------------------------- reads
    async def list_page(self, business_id: str, params: PageParams, bank_account_id: str | None = None,
                        party_id: str | None = None) -> CashTransactionListResponse:
        dp = await self.posting.decimals(business_id)
        rows, total, amount = await self.repo.list_page(
            business_id, self.direction, dp, params.offset, params.page_size, bank_account_id, party_id
        )
        items = [CashTransactionListItem.model_validate(
            {**r._mapping, "amount": round_money(r.amount, dp)}) for r in rows]
        return CashTransactionListResponse.build(items, total, params.page, params.page_size,
                                                 total_amount=round_money(amount, dp))

    async def get(self, business_id: str, document_id: str) -> CashTransactionResponse:
        return await self._response(await self._document(business_id, document_id))

    async def totals(self, business_id: str, lines: list[LineAmountsIn]) -> CashTotalsResponse:
        dp = await self.posting.decimals(business_id)
        amounts = [line_amount(x, dp) for x in lines]
        return CashTotalsResponse(lines=[LineAmountResponse(amount=a) for a in amounts],
                                  total=sum(amounts, round_money(ZERO, dp)))

    async def lines_report(self, business_id: str, params: PageParams) -> CashLineReportResponse:
        dp = await self.posting.decimals(business_id)
        rows, total = await self.repo.lines_report(business_id, self.direction, dp, params.offset, params.page_size)
        items = [CashLineReportItem.model_validate({**r._mapping, "amount": round_money(r.amount, dp)})
                 for r in rows]
        return CashLineReportResponse.build(items, total, params.page, params.page_size)

    # ---------------------------------------------------------------- writes
    async def create(self, ctx: BusinessContext, body: CreateCashTransactionRequest) -> CashTransactionResponse:
        await self.posting.assert_open(ctx.business_id, body.date)
        prepared = await self._prepare(ctx.business_id, body, require_postable=body.post)
        document = await self.posting.create_header(
            ctx, self.direction, self.area, _header(body), POSTED if body.post else DRAFT
        )
        await self.repo.add(self._extension(document, body))
        await self._store_lines(document, prepared)
        if body.post:
            await self._post_settled(ctx, document, body.date, prepared)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "create", self.entity, document.id, ctx.business_id, after=after)
        return after

    async def update(self, ctx: BusinessContext, document_id: str,
                     body: UpdateCashTransactionRequest) -> CashTransactionResponse:
        document = await self._writable(ctx, document_id, body.version)
        before = await self._response(document)
        await self.posting.assert_open(ctx.business_id, document.document_date, body.date)
        posted = await self.posting.status_of(document) == POSTED
        prepared = await self._prepare(ctx.business_id, body, require_postable=posted)
        extension = await self.repo.get(ctx.business_id, document.id)
        allocations = []
        if posted:
            ledger, allocations = await self.settlement.settle(ctx, document, body.date, prepared.lines,
                                                               prepared.amounts, prepared.ledger)
            prepared = replace(prepared, ledger=ledger)
        if posted and await self._same_ledger(document, body, prepared):
            # No ledger change: description, clear dates, counterparty, line texts (PR-75 allows
            # description and clear dates on a locked document; the DB guards the rest).
            await self.posting.update_descriptions(ctx, document, body.description)
            _apply_extension(extension, body)
            await self.repo.save()
            await self._update_lines_in_place(document, prepared)
        else:
            await self.posting.update_header(ctx, document, _header(body))
            _apply_extension(extension, body)
            await self.repo.save()
            await self._store_lines(document, prepared)
            if posted:
                await self.posting.repost_lines(ctx, document, prepared.ledger)
        if posted:
            await self.posting.replace_allocations(ctx, document, allocations)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "update", self.entity, document.id, ctx.business_id,
                                before=before, after=after)
        return after

    async def post(self, ctx: BusinessContext, document_id: str, version: int) -> CashTransactionResponse:
        document = await self._writable(ctx, document_id, version)
        if await self.posting.status_of(document) != DRAFT:
            raise ConflictError("Only a draft can be posted", "document_not_draft")
        before = await self._response(document)
        prepared = await self._prepare_stored(document)
        await self._post_settled(ctx, document, document.document_date, prepared)
        await self.posting.set_status(ctx, document, POSTED)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "post", self.entity, document.id, ctx.business_id,
                                before=before, after=after)
        return after

    async def void(self, ctx: BusinessContext, document_id: str, version: int) -> CashTransactionResponse:
        document = await self._writable(ctx, document_id, version)
        before = await self._response(document)
        await self.posting.void(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "void", self.entity, document.id, ctx.business_id,
                                before=before, after=after)
        return after

    async def _post_settled(self, ctx: BusinessContext, document: Document, on, prepared: Prepared) -> None:
        """Post the receipt with its AR lines split by the invoices they settle (PR-02, PR-22)."""
        ledger, allocations = await self.settlement.settle(ctx, document, on, prepared.lines, prepared.amounts,
                                                           prepared.ledger)
        await self.posting.post_lines(ctx, document, ledger)
        await self.posting.replace_allocations(ctx, document, allocations)

    # ---------------------------------------------------------------- validation
    async def _bank(self, business_id: str, bank_account_id: str | None) -> BankAccount | None:
        """None = no account chosen (the bank side goes to Suspense, PR-78); an unknown id is refused."""
        if not bank_account_id:
            return None
        bank = await self.banks.get(business_id, bank_account_id)
        if bank is None:
            raise LedgerValidationError("Choose a bank or cash account of this business", "bank_account_required")
        return bank

    async def _check_header(self, business_id: str, bank: BankAccount | None, clears_later: bool,
                            party_id: str | None) -> None:
        if clears_later and not (bank and bank.can_have_pending):
            raise LedgerValidationError(
                "This bank or cash account cannot have pending transactions", "cleared_not_allowed")
        if party_id and (await self.repo.party_kinds(business_id, {party_id})).get(party_id) not in COUNTERPARTY_KINDS:
            raise LedgerValidationError("Contact not found in this business", "counterparty_invalid")

    async def _check_invoices(self, business_id: str, lines: list) -> None:
        """An invoice may be named only on a receipt's Accounts receivable line with its customer."""
        if not any(x.invoice_id for x in lines):
            return
        ar = await self.settlement.receivable_account(business_id)
        if self.direction != RECEIPT or any(x.invoice_id and (x.account_id != ar or not x.party_id) for x in lines):
            raise LedgerValidationError("Only a receipt's Accounts receivable line with a customer can name an invoice",
                                        "invoice_not_allowed")

    async def _prepare(self, business_id: str, body: CashTransactionFields, *,
                       require_postable: bool) -> Prepared:
        if any(x.account_id is None for x in body.lines):
            raise LedgerValidationError("Every line needs an account", "account_required")
        await self._check_invoices(business_id, body.lines)
        bank = await self._bank(business_id, body.bank_account_id)
        await self._check_header(business_id, bank, body.clears_later, body.counterparty_party_id)
        dp = await self.posting.decimals(business_id)
        lines = [
            CashTransactionLine(
                business_id=business_id, line_no=no, account_id=x.account_id, party_id=x.party_id,
                invoice_document_id=x.invoice_id, qty=x.qty, unit_price=x.unit_price,
                discount=round_money(x.discount, dp) if x.discount is not None else None,
                description=x.description,
            )
            for no, x in enumerate(body.lines, start=1)
        ]
        return await self._ledger(business_id, bank and bank.id, lines, dp, require_postable)

    async def _prepare_stored(self, document: Document) -> Prepared:
        """A draft's stored form, validated as if it were posted now."""
        extension = await self.repo.get(document.business_id, document.id)
        lines = await self.repo.lines(document.business_id, document.id)
        if any(x.account_id is None for x in lines):
            raise LedgerValidationError("Every line needs an account", "account_required")
        bank = await self._bank(document.business_id, extension.bank_account_id)
        await self._check_header(document.business_id, bank, extension.clears_later, extension.counterparty_party_id)
        return await self._ledger(document.business_id, bank and bank.id, lines,
                                  await self.posting.decimals(document.business_id), True)

    async def _ledger(self, business_id: str, bank_account_id: str | None, lines: list[CashTransactionLine],
                      dp: int, require_postable: bool) -> Prepared:
        """Ledger image (PR-01 / PR-07 / PR-78): the bank line for the total (Suspense when no bank
        or cash account is chosen), one line per non-zero line."""
        cash = await self.coa.system_account_id(business_id, CASH_CONTROL)
        bank_side = cash if bank_account_id else await self.coa.system_account_id(business_id, SUSPENSE)
        if any(x.account_id == cash for x in lines):
            raise LedgerValidationError(
                "Move money between bank and cash accounts with an inter account transfer", "account_not_supported")
        amounts = [line_amount(x, dp) for x in lines]
        total = sum(amounts, ZERO)
        if require_postable and total <= 0:
            raise LedgerValidationError("The total must be more than zero", "total_not_positive")
        receipt = self.direction == RECEIPT
        ledger = [LineInput(bank_side, total if receipt else ZERO, ZERO if receipt else total,
                            bank_account_id=bank_account_id)]
        for line, amount in zip(lines, amounts):
            if amount == 0:
                continue
            credit = (amount > 0) == receipt
            ledger.append(LineInput(line.account_id, ZERO if credit else abs(amount), abs(amount) if credit else ZERO,
                                    line.description, party_id=line.party_id))
        await self.posting.assert_lines(business_id, ledger)
        return Prepared(lines, amounts, ledger)

    async def _same_ledger(self, document: Document, body: CashTransactionFields, prepared: Prepared) -> bool:
        current = await self.posting.live_lines(document)
        same_lines = [_line_key(x) for x in await self.repo.lines(document.business_id, document.id)] == \
            [_line_key(x) for x in prepared.lines]
        return (
            document.document_date == body.date
            and (body.reference is None or body.reference == document.reference)
            and same_lines
            and [x.ledger_key() for x in current] == [x.ledger_key() for x in prepared.ledger]
        )

    # ---------------------------------------------------------------- storage helpers
    def _extension(self, document: Document, body: CashTransactionFields) -> CashTransaction:
        extension = CashTransaction(document_id=document.id, business_id=document.business_id,
                                    direction=self.direction)
        _apply_extension(extension, body)
        return extension

    async def _store_lines(self, document: Document, prepared: Prepared) -> None:
        for line in prepared.lines:
            line.document_id = document.id
        await self.repo.replace_lines(document.business_id, document.id, prepared.lines)

    async def _update_lines_in_place(self, document: Document, prepared: Prepared) -> None:
        for stored, wanted in zip(await self.repo.lines(document.business_id, document.id), prepared.lines):
            stored.description = wanted.description
        await self.repo.save()

    async def _document(self, business_id: str, document_id: str, *, for_update: bool = False) -> Document:
        document = None
        if is_uuid(document_id):
            document = await self.posting.get_document(business_id, document_id, self.direction,
                                                       for_update=for_update)
        if document is None:
            raise ResourceNotFoundError(self.entity, document_id)
        return document

    async def _writable(self, ctx: BusinessContext, document_id: str, version: int) -> Document:
        document = await self._document(ctx.business_id, document_id, for_update=True)
        check_version(document, version)
        if await self.posting.status_of(document) == VOID:
            raise ConflictError(f"A void {self.entity.lower()} cannot be changed", "document_void")
        return document

    async def _response(self, document: Document) -> CashTransactionResponse:
        business_id = document.business_id
        dp = await self.posting.decimals(business_id)
        extension = await self.repo.get(business_id, document.id)
        detail = await self.repo.detail(business_id, document.id)
        lines = [
            CashLineResponse.model_validate({**r._mapping, "amount": line_amount(r, dp)})
            for r in await self.repo.line_rows(business_id, document.id)
        ]
        allocations = [AllocationResponse.model_validate({**r._mapping, "amount": round_money(r.amount, dp),
                                                          "early_discount": round_money(r.early_discount, dp)})
                       for r in await self.repo.allocations(business_id, document.id)]
        status = await self.posting.status_of(document)
        ar = await self.settlement.receivable_account(business_id)
        receivable = sum((x.amount for x in lines if x.account_id == ar), ZERO)
        credit = receivable - sum((a.amount for a in allocations), ZERO)
        return CashTransactionResponse(
            allocations=allocations,
            early_discount_total=round_money(sum((a.early_discount for a in allocations), ZERO), dp),
            unallocated_credit=round_money(credit if self.direction == RECEIPT and status == POSTED else ZERO, dp),
            id=document.id, direction=self.direction, reference=document.reference, date=document.document_date,
            status=status, version=document.version,
            is_locked=await self.posting.is_locked(document),
            bank_account_id=extension.bank_account_id, bank_account_name=detail.bank_account_name,
            bank_can_have_pending=detail.bank_can_have_pending,
            counterparty_party_id=extension.counterparty_party_id, counterparty_kind=detail.counterparty_kind,
            counterparty_name=extension.counterparty_name,
            counterparty=extension.counterparty_name or detail.party_name,
            description=document.description, clears_later=extension.clears_later,
            cleared_on=extension.cleared_on, is_pending=extension.clears_later and extension.cleared_on is None,
            lines=lines, total=sum((x.amount for x in lines), round_money(ZERO, dp)),
            created_at=document.created_at, updated_at=document.updated_at,
        )


def _header(body: CashTransactionFields) -> DocumentHeader:
    return DocumentHeader(body.date, body.reference, body.description)


def _apply_extension(extension: CashTransaction, body: CashTransactionFields) -> None:
    extension.bank_account_id = body.bank_account_id
    extension.counterparty_party_id = body.counterparty_party_id
    extension.counterparty_name = body.counterparty_name
    extension.clears_later = body.clears_later
    extension.cleared_on = body.cleared_on


def _line_key(line: CashTransactionLine) -> tuple:
    return (line.account_id, line.party_id, line.invoice_document_id, line.qty, line.unit_price, line.discount)
