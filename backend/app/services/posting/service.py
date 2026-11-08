"""Posting service: the only writer of documents, document_lines, journal_entries, journal_lines.

Everything runs in the caller's transaction (the document change and its ledger effect
commit together). The database backs every rule up (migration 20261108000027): balance at
COMMIT, immutable posted lines, inclusive lock date, unique numbering.
"""

from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import JournalUnbalancedError, LedgerValidationError, PeriodLockedError
from app.core.money import DEFAULT_CURRENCY_DECIMALS, round_money
from app.models.ledger import Document, DocumentLine, JournalEntry, JournalLine, OpeningBalance
from app.repositories.ledger_repository import LedgerRepository
from app.services.access_service import BusinessContext

DRAFT, POSTED, VOID = "draft", "posted", "void"
SOURCE_DOCUMENT, SOURCE_REVERSAL, SOURCE_OPENING = "document", "reversal", "opening"
OPENING_BALANCE = "opening_balance"
MIN_POSTED_LINES = 2


@dataclass(frozen=True)
class LineInput:
    account_id: str
    debit: Decimal
    credit: Decimal
    description: str | None = None


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

    async def books_start_date(self, business_id: str) -> date:
        return await self.repo.books_start_date(business_id)

    async def assert_on_or_after_books_start(self, business_id: str, type_key: str, document_date: date) -> None:
        """Only opening balances (dated books_start_date - 1) may precede the books (posting-rules §10)."""
        if type_key == OPENING_BALANCE:
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
        return [
            LineInput(x.account_id, round_money(x.debit, dp), round_money(x.credit, dp), x.description)
            for x in lines
        ]

    async def _assert_accounts_postable(self, business_id: str, lines: list) -> None:
        wanted = {x.account_id for x in lines}
        if await self.repo.postable_account_ids(business_id, wanted) != wanted:
            raise LedgerValidationError("Every line needs an active account of this business", "invalid_account")

    # ---------------------------------------------------------------- documents
    async def get_document(self, business_id: str, document_id: str, type_key: str,
                           *, for_update: bool = False) -> Document | None:
        type_id = await self.repo.document_type_id(type_key)
        return await self.repo.get_document(business_id, document_id, type_id, for_update=for_update)

    async def status_of(self, document: Document) -> str:
        return await self.repo.status_key(document.status_id)

    async def document_lines(self, document: Document) -> list[DocumentLine]:
        return await self.repo.lines(document.business_id, document.id)

    async def create_document(
        self, ctx: BusinessContext, type_key: str, area_key: str, header: DocumentHeader,
        lines: list[LineInput], status: str,
    ) -> Document:
        """Insert the document (numbered when no reference is given) and its lines."""
        await self.assert_open(ctx.business_id, header.document_date)
        await self.assert_on_or_after_books_start(ctx.business_id, type_key, header.document_date)
        await self._assert_accounts_postable(ctx.business_id, lines)
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
        await self._write_lines(document, lines)
        return document

    async def update_document(
        self, ctx: BusinessContext, document: Document, header: DocumentHeader, lines: list[LineInput]
    ) -> None:
        """Replace header and lines (draft, or a posted document about to be reposted)."""
        await self.assert_open(ctx.business_id, document.document_date, header.document_date)
        type_key = await self.repo.document_type_key(document.document_type_id)
        await self.assert_on_or_after_books_start(ctx.business_id, type_key, header.document_date)
        await self._assert_accounts_postable(ctx.business_id, lines)
        document.document_date = header.document_date
        document.reference = header.reference or document.reference
        document.description = header.description
        _touch(document, ctx)
        await self.repo.save(document)
        await self._write_lines(document, lines)

    async def update_descriptions(
        self, ctx: BusinessContext, document: Document, description: str | None,
        line_descriptions: list[str | None],
    ) -> None:
        """The one change a locked document accepts (PR-75): document and line descriptions."""
        document.description = description
        _touch(document, ctx)
        await self.repo.save(document)
        await self.repo.update_line_descriptions(await self.document_lines(document), line_descriptions)

    async def set_status(self, ctx: BusinessContext, document: Document, status: str) -> None:
        document.status_id = await self.repo.status_id(status)
        _touch(document, ctx)
        await self.repo.save(document)

    async def _write_lines(self, document: Document, lines: list[LineInput]) -> None:
        await self.repo.replace_lines(document.business_id, document.id, [
            DocumentLine(
                business_id=document.business_id, document_id=document.id, line_no=no,
                account_id=x.account_id, debit=x.debit, credit=x.credit, description=x.description,
            )
            for no, x in enumerate(lines, start=1)
        ])

    # ---------------------------------------------------------------- journal
    async def post(self, ctx: BusinessContext, document: Document, source: str = SOURCE_DOCUMENT) -> JournalEntry:
        """Copy the document's lines into one balanced journal entry dated the document date."""
        lines = await self.document_lines(document)
        debit, credit = totals(lines)
        if debit != credit:
            raise JournalUnbalancedError()
        if len(lines) < MIN_POSTED_LINES or any((x.debit > 0) == (x.credit > 0) for x in lines):
            raise LedgerValidationError(
                "A posted entry needs at least two lines, each with a debit or a credit", "journal_lines_invalid"
            )
        await self.assert_open(ctx.business_id, document.document_date)
        entry = JournalEntry(
            business_id=ctx.business_id, document_id=document.id,
            source_id=await self.repo.source_id(source),
            entry_date=document.document_date, memo=document.description, posted_by=ctx.user_id,
        )
        await self.repo.add_entry(entry, [
            JournalLine(
                business_id=ctx.business_id, line_no=x.line_no, account_id=x.account_id,
                debit=x.debit, credit=x.credit, document_line_id=x.id, description=x.description,
            )
            for x in lines
        ])
        return entry

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
            )
            for x in originals
        ])
        return reversal

    async def reverse_live_entry(self, ctx: BusinessContext, document: Document) -> JournalEntry | None:
        entry = await self.repo.live_entry(ctx.business_id, document.id)
        return await self.reverse(ctx, entry) if entry else None

    async def link_opening_balance(self, ctx: BusinessContext, document: Document, kind_key: str,
                                   account_id: str) -> None:
        """Name the opening document's source record (one live row per record, DB trigger)."""
        await self.repo.add_opening_balance(OpeningBalance(
            document_id=document.id, business_id=ctx.business_id, kind_key=kind_key, account_id=account_id,
        ))

    async def repost(self, ctx: BusinessContext, document: Document) -> JournalEntry:
        """PR-73: edit of a posted document = reversal of its current entry + a new entry."""
        await self.reverse_live_entry(ctx, document)
        return await self.post(ctx, document)

    async def void(self, ctx: BusinessContext, document: Document) -> None:
        """Posted: reversal + status void. Draft: status void, no ledger effect."""
        await self.assert_open(ctx.business_id, document.document_date)
        await self.reverse_live_entry(ctx, document)
        await self.set_status(ctx, document, VOID)
