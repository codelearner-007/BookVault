"""Posting service: the only writer of documents, document_lines, journal_entries, journal_lines.

Everything runs in the caller's transaction (the document change and its ledger effect
commit together). The database backs every rule up (migration 20261108000027): balance at
COMMIT, immutable posted lines, inclusive lock date, unique numbering.

Two kinds of documents: types without a typed line table (journal entries, opening balances)
keep their editable lines in document_lines and post them with `post`; typed documents
(receipts, payments, transfers, B3; trade documents, late fees, B4) keep their own lines and
post computed lines with `post_lines`. Every line passes the same sub-ledger rules
(`_assert_dimensions`). Allocations (which document settles which invoice, PR-64) and document
links are written here too, in the same transaction as the posting.
"""

from dataclasses import dataclass, replace
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import JournalUnbalancedError, LedgerValidationError, PeriodLockedError
from app.core.money import DEFAULT_CURRENCY_DECIMALS, round_money
from app.models.ledger import (
    Document,
    DocumentLine,
    JournalEntry,
    JournalLine,
    OpeningBalance,
    PaymentAllocation,
)
from app.models.sales import DocumentLink
from app.repositories.ledger_repository import LedgerRepository
from app.services.access_service import BusinessContext

DRAFT, POSTED, VOID = "draft", "posted", "void"
SOURCE_DOCUMENT, SOURCE_REVERSAL, SOURCE_OPENING = "document", "reversal", "opening"
OPENING_BALANCE = "opening_balance"
MIN_POSTED_LINES = 2

# Sub-ledger kinds (system_account_types.subledger_kind) and the party kind each control account
# takes; control accounts of later phases (AP: B5, assets: B9, ...) are not postable yet.
SUBLEDGER_NONE, SUBLEDGER_BANK, SUBLEDGER_PARTY = "none", "bank_account", "party"
PARTY_KIND_OF_CONTROL = {"capital_control": "capital_account", "accounts_receivable": "customer"}


@dataclass(frozen=True)
class LineInput:
    account_id: str
    debit: Decimal
    credit: Decimal
    description: str | None = None
    bank_account_id: str | None = None
    party_id: str | None = None
    invoice_document_id: str | None = None
    item_id: str | None = None
    tax_code_id: str | None = None

    def ledger_key(self) -> tuple:
        return (self.account_id, self.debit, self.credit, self.bank_account_id, self.party_id,
                self.invoice_document_id, self.item_id, self.tax_code_id)

    def dimensions(self) -> dict:
        return {"bank_account_id": self.bank_account_id, "party_id": self.party_id,
                "invoice_document_id": self.invoice_document_id, "item_id": self.item_id,
                "tax_code_id": self.tax_code_id}


@dataclass(frozen=True)
class Allocation:
    """Part of an invoice settled by a document (amount received + early-payment discount)."""

    invoice_document_id: str
    amount: Decimal
    early_discount: Decimal = Decimal(0)


@dataclass(frozen=True)
class DocumentHeader:
    document_date: date
    reference: str | None
    description: str | None


def _touch(document: Document, ctx: BusinessContext) -> None:
    """Always write the row, so its version moves on every change (VersionedMixin, AC-20)."""
    document.updated_by = ctx.user_id
    document.updated_at = datetime.now(timezone.utc)


def totals(lines: list) -> tuple[Decimal, Decimal]:
    """Sum of debits and credits of lines with .debit / .credit (already rounded)."""
    return sum((x.debit for x in lines), Decimal(0)), sum((x.credit for x in lines), Decimal(0))


def _invalid(message: str, code: str) -> LedgerValidationError:
    return LedgerValidationError(message, code)


class PostingService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = LedgerRepository(session)

    # ---------------------------------------------------------------- guards and rounding
    async def lock_date(self, business_id: str) -> date | None:
        return await self.repo.lock_date(business_id)

    async def assert_open(self, business_id: str, *dates: date) -> None:
        """PR-75: inclusive lock; checked here (readable 409) and by the DB triggers."""
        lock = await self.repo.lock_date(business_id)
        if lock is not None and any(d <= lock for d in dates):
            raise PeriodLockedError(lock.isoformat())

    async def is_locked(self, document: Document) -> bool:
        lock = await self.repo.lock_date(document.business_id)
        return lock is not None and document.document_date <= lock

    async def books_start_date(self, business_id: str) -> date:
        return await self.repo.books_start_date(business_id)

    async def assert_on_or_after_books_start(self, business_id: str, type_key: str, document_date: date,
                                             *, starting_balance: bool = False) -> None:
        """Only opening balances (dated books_start_date - 1) and starting-balance invoices (PR-61,
        D-36, flagged explicitly) may precede the books (posting-rules §10)."""
        if type_key == OPENING_BALANCE or starting_balance:
            return
        start = await self.repo.books_start_date(business_id)
        if document_date < start:
            raise LedgerValidationError(
                f"The date is before the books start date ({start.isoformat()})", "before_books_start"
            )

    async def decimals(self, business_id: str) -> int:
        """Decimal places of the base currency (rounding unit of every amount)."""
        return await self.repo.base_decimals(business_id) or DEFAULT_CURRENCY_DECIMALS

    async def round_lines(self, business_id: str, lines: list[LineInput]) -> list[LineInput]:
        dp = await self.decimals(business_id)
        return [replace(x, debit=round_money(x.debit, dp), credit=round_money(x.credit, dp)) for x in lines]

    async def _assert_accounts_postable(self, business_id: str, lines: list) -> None:
        wanted = {x.account_id for x in lines}
        if await self.repo.postable_account_ids(business_id, wanted) != wanted:
            raise LedgerValidationError("Every line needs an active account of this business", "invalid_account")

    async def _assert_dimensions(self, business_id: str, lines: list) -> None:
        """Each line carries exactly the sub-ledger its account needs (PR-01, PR-10, T08, T01)."""
        kinds = await self.repo.account_subledgers(business_id, {x.account_id for x in lines})
        banks = {x.bank_account_id for x in lines if x.bank_account_id}
        if banks and await self.repo.live_bank_account_ids(business_id, banks) != banks:
            raise _invalid("Bank or cash account not found in this business", "bank_account_required")
        parties = await self.repo.party_kinds(business_id, {x.party_id for x in lines if x.party_id})
        for line in lines:
            self._check_line_dimensions(line, *kinds[line.account_id], parties)

    @staticmethod
    def _check_line_dimensions(line, system_code: str | None, subledger: str, parties: dict[str, str]) -> None:
        if subledger == SUBLEDGER_BANK:
            if not line.bank_account_id:
                raise _invalid("A Cash & cash equivalents line needs its bank or cash account", "bank_account_required")
            if line.party_id:
                raise _invalid("This account takes no party", "party_not_allowed")
            return
        if line.bank_account_id:
            raise _invalid("Only Cash & cash equivalents lines take a bank or cash account", "bank_account_not_allowed")
        if subledger == SUBLEDGER_NONE:
            if line.party_id:
                raise _invalid("This account takes no party", "party_not_allowed")
            return
        wanted_kind = PARTY_KIND_OF_CONTROL.get(system_code) if subledger == SUBLEDGER_PARTY else None
        if wanted_kind is None:
            raise _invalid("This control account cannot be used here yet", "account_not_supported")
        if not line.party_id:
            raise _invalid("This control account needs a party on the line", "party_required")
        if parties.get(line.party_id) != wanted_kind:
            raise _invalid("The party does not belong to this control account", "party_required")

    async def assert_lines(self, business_id: str, lines: list) -> None:
        if lines:
            await self._assert_accounts_postable(business_id, lines)
            await self._assert_dimensions(business_id, lines)

    # ---------------------------------------------------------------- documents
    async def get_document(self, business_id: str, document_id: str, type_key: str,
                           *, for_update: bool = False) -> Document | None:
        type_id = await self.repo.document_type_id(type_key)
        return await self.repo.get_document(business_id, document_id, type_id, for_update=for_update)

    async def status_of(self, document: Document) -> str:
        return await self.repo.status_key(document.status_id)

    async def document_lines(self, document: Document) -> list[DocumentLine]:
        return await self.repo.lines(document.business_id, document.id)

    async def create_header(
        self, ctx: BusinessContext, type_key: str, area_key: str, header: DocumentHeader, status: str,
        *, starting_balance: bool = False,
    ) -> Document:
        """Insert the document row only (numbered when no reference is given)."""
        await self.assert_open(ctx.business_id, header.document_date)
        await self.assert_on_or_after_books_start(ctx.business_id, type_key, header.document_date,
                                                  starting_balance=starting_balance)
        reference = header.reference or await self.repo.next_reference(ctx.business_id, type_key, area_key)
        document = Document(
            business_id=ctx.business_id,
            document_type_id=await self.repo.document_type_id(type_key),
            status_id=await self.repo.status_id(status),
            area_key=area_key,
            document_date=header.document_date,
            reference=reference,
            description=header.description,
            created_by=ctx.user_id,
            updated_by=ctx.user_id,
        )
        await self.repo.add(document)
        return document

    async def create_document(
        self, ctx: BusinessContext, type_key: str, area_key: str, header: DocumentHeader,
        lines: list[LineInput], status: str,
    ) -> Document:
        """Insert the document and its document_lines (types without a typed line table)."""
        await self.assert_open(ctx.business_id, header.document_date)
        await self.assert_lines(ctx.business_id, lines)
        document = await self.create_header(ctx, type_key, area_key, header, status)
        await self._write_lines(document, lines)
        return document

    async def update_header(self, ctx: BusinessContext, document: Document, header: DocumentHeader,
                            *, starting_balance: bool = False) -> None:
        await self.assert_open(ctx.business_id, document.document_date, header.document_date)
        type_key = await self.repo.document_type_key(document.document_type_id)
        await self.assert_on_or_after_books_start(ctx.business_id, type_key, header.document_date,
                                                  starting_balance=starting_balance)
        document.document_date = header.document_date
        document.reference = header.reference or document.reference
        document.description = header.description
        _touch(document, ctx)
        await self.repo.save(document)

    async def update_document(
        self, ctx: BusinessContext, document: Document, header: DocumentHeader, lines: list[LineInput]
    ) -> None:
        """Replace header and lines (draft, or a posted document about to be reposted)."""
        await self.assert_open(ctx.business_id, document.document_date, header.document_date)
        await self.assert_lines(ctx.business_id, lines)
        await self.update_header(ctx, document, header)
        await self._write_lines(document, lines)

    async def update_descriptions(
        self, ctx: BusinessContext, document: Document, description: str | None,
        line_descriptions: list[str | None] | None = None,
    ) -> None:
        """The one change a locked document accepts (PR-75): document and line descriptions."""
        document.description = description
        _touch(document, ctx)
        await self.repo.save(document)
        if line_descriptions is not None:
            await self.repo.update_line_descriptions(await self.document_lines(document), line_descriptions)

    async def touch(self, ctx: BusinessContext, document: Document) -> None:
        """Bump the version after a change to the document's typed extension only."""
        _touch(document, ctx)
        await self.repo.save(document)

    async def set_status(self, ctx: BusinessContext, document: Document, status: str) -> None:
        document.status_id = await self.repo.status_id(status)
        _touch(document, ctx)
        await self.repo.save(document)

    async def _write_lines(self, document: Document, lines: list[LineInput]) -> None:
        await self.repo.replace_lines(document.business_id, document.id, [
            DocumentLine(
                business_id=document.business_id, document_id=document.id, line_no=no,
                account_id=x.account_id, debit=x.debit, credit=x.credit, description=x.description,
                **x.dimensions(),
            )
            for no, x in enumerate(lines, start=1)
        ])

    # ---------------------------------------------------------------- journal
    @staticmethod
    def _assert_balanced(lines: list) -> None:
        debit, credit = totals(lines)
        if debit != credit:
            raise JournalUnbalancedError()
        if len(lines) < MIN_POSTED_LINES or any((x.debit > 0) == (x.credit > 0) for x in lines):
            raise LedgerValidationError(
                "A posted entry needs at least two lines, each with a debit or a credit", "journal_lines_invalid"
            )

    async def _add_entry(self, ctx: BusinessContext, document: Document, source: str,
                         lines: list[JournalLine]) -> JournalEntry:
        await self.assert_open(ctx.business_id, document.document_date)
        entry = JournalEntry(
            business_id=ctx.business_id, document_id=document.id,
            source_id=await self.repo.source_id(source),
            entry_date=document.document_date, memo=document.description, posted_by=ctx.user_id,
        )
        await self.repo.add_entry(entry, lines)
        return entry

    async def post(self, ctx: BusinessContext, document: Document, source: str = SOURCE_DOCUMENT) -> JournalEntry:
        """Copy the document's lines into one balanced journal entry dated the document date."""
        lines = await self.document_lines(document)
        self._assert_balanced(lines)
        await self._assert_dimensions(ctx.business_id, lines)
        return await self._add_entry(ctx, document, source, [
            JournalLine(
                business_id=ctx.business_id, line_no=x.line_no, account_id=x.account_id,
                debit=x.debit, credit=x.credit, document_line_id=x.id, description=x.description,
                bank_account_id=x.bank_account_id, party_id=x.party_id,
                invoice_document_id=x.invoice_document_id, item_id=x.item_id, tax_code_id=x.tax_code_id,
            )
            for x in lines
        ])

    async def post_lines(self, ctx: BusinessContext, document: Document, lines: list[LineInput]) -> JournalEntry:
        """Post computed lines of a typed document (receipt, invoice, transfer, ...) as one entry."""
        self._assert_balanced(lines)
        await self.assert_lines(ctx.business_id, lines)
        return await self._add_entry(ctx, document, SOURCE_DOCUMENT, [
            JournalLine(
                business_id=ctx.business_id, line_no=no, account_id=x.account_id, debit=x.debit,
                credit=x.credit, description=x.description, **x.dimensions(),
            )
            for no, x in enumerate(lines, start=1)
        ])

    async def live_lines(self, document: Document) -> list[LineInput]:
        """The lines of the document's current posting (empty for drafts and void documents)."""
        entry = await self.repo.live_entry(document.business_id, document.id)
        if entry is None:
            return []
        return [
            LineInput(x.account_id, x.debit, x.credit, x.description, x.bank_account_id, x.party_id,
                      x.invoice_document_id, x.item_id, x.tax_code_id)
            for x in await self.repo.entry_lines(document.business_id, entry.id)
        ]

    async def reverse(self, ctx: BusinessContext, entry: JournalEntry) -> JournalEntry:
        """PR-74 / INV-6: a reversal dated like the original whose lines exactly negate it."""
        await self.assert_open(ctx.business_id, entry.entry_date)
        reversal = JournalEntry(
            business_id=ctx.business_id, document_id=entry.document_id,
            source_id=await self.repo.source_id(SOURCE_REVERSAL), reverses_entry_id=entry.id,
            entry_date=entry.entry_date, memo=entry.memo, posted_by=ctx.user_id,
        )
        originals = await self.repo.entry_lines(ctx.business_id, entry.id)
        await self.repo.add_entry(reversal, [
            JournalLine(
                business_id=ctx.business_id, line_no=x.line_no, account_id=x.account_id,
                debit=x.credit, credit=x.debit, document_line_id=x.document_line_id,
                line_date=x.line_date, description=x.description,
                bank_account_id=x.bank_account_id, party_id=x.party_id,
                invoice_document_id=x.invoice_document_id, item_id=x.item_id, tax_code_id=x.tax_code_id,
            )
            for x in originals
        ])
        return reversal

    async def reverse_live_entry(self, ctx: BusinessContext, document: Document) -> JournalEntry | None:
        entry = await self.repo.live_entry(ctx.business_id, document.id)
        return await self.reverse(ctx, entry) if entry else None

    async def link_opening_balance(self, ctx: BusinessContext, document: Document, kind_key: str,
                                   account_id: str | None = None, bank_account_id: str | None = None,
                                   invoice_document_id: str | None = None,
                                   paid_before_start: Decimal | None = None) -> None:
        """Name the opening document's source record (one live row per record, DB trigger)."""
        await self.repo.add_opening_balance(OpeningBalance(
            document_id=document.id, business_id=ctx.business_id, kind_key=kind_key,
            account_id=account_id, bank_account_id=bank_account_id,
            invoice_document_id=invoice_document_id, paid_before_start=paid_before_start,
        ))

    # ---------------------------------------------------------------- allocations and links
    async def replace_allocations(self, ctx: BusinessContext, document: Document,
                                  allocations: list[Allocation]) -> None:
        """The invoices this document settles (stored at posting, never re-shuffled, PR-64)."""
        await self.repo.delete_allocations(ctx.business_id, document.id)
        await self.repo.add_allocations([
            PaymentAllocation(business_id=ctx.business_id, settling_document_id=document.id,
                              invoice_document_id=a.invoice_document_id, amount=a.amount,
                              early_discount=a.early_discount)
            for a in allocations if a.amount > 0
        ])

    async def allocations_of(self, document: Document) -> list[PaymentAllocation]:
        return await self.repo.allocations(document.business_id, document.id)

    async def unlink(self, ctx: BusinessContext, to_document: Document, link_type: str) -> None:
        await self.repo.delete_links(ctx.business_id, to_document.id, link_type)

    async def link(self, ctx: BusinessContext, from_document_id: str, to_document: Document, link_type: str) -> None:
        await self.repo.add_link(DocumentLink(business_id=ctx.business_id, from_document_id=from_document_id,
                                              to_document_id=to_document.id, link_type_key=link_type))

    async def repost(self, ctx: BusinessContext, document: Document) -> JournalEntry:
        """PR-73: edit of a posted document = reversal of its current entry + a new entry."""
        await self.reverse_live_entry(ctx, document)
        return await self.post(ctx, document)

    async def repost_lines(self, ctx: BusinessContext, document: Document, lines: list[LineInput]) -> JournalEntry:
        await self.reverse_live_entry(ctx, document)
        return await self.post_lines(ctx, document, lines)

    async def void(self, ctx: BusinessContext, document: Document) -> None:
        """Posted: reversal + status void; what it settled is released. Draft: status void only."""
        await self.assert_open(ctx.business_id, document.document_date)
        await self.reverse_live_entry(ctx, document)
        await self.repo.delete_allocations(ctx.business_id, document.id)
        await self.set_status(ctx, document, VOID)
