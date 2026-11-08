"""Manual Journal Entries (B1): drafts, post, edit (reverse-and-repost), void, views.

Every write goes through the posting service, in the request's transaction; every
mutation writes an audit row with before/after (B0.5).
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.models.ledger import Document
from app.repositories.ledger_query_repository import LedgerQueryRepository
from app.schemas.request.journal_entry import (
    AmountsIn,
    CreateJournalEntryRequest,
    JournalLineIn,
    UpdateJournalEntryRequest,
)
from app.schemas.response.journal_entry import (
    JournalEntryLineResponse,
    JournalEntryListItem,
    JournalEntryListResponse,
    JournalEntryResponse,
    JournalTotalsResponse,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.posting import DRAFT, POSTED, VOID, DocumentHeader, LineInput, PostingService, totals
from app.services.versioning import check_version

ENTITY = "JournalEntry"
DOCUMENT_TYPE = "journal_entry"
AREA = "journal_entries"


def _line_inputs(lines: list[JournalLineIn]) -> list[LineInput]:
    return [LineInput(x.account_id, x.debit, x.credit, x.description, x.bank_account_id, x.party_id) for x in lines]


def _header(body: CreateJournalEntryRequest | UpdateJournalEntryRequest) -> DocumentHeader:
    return DocumentHeader(body.date, body.reference, body.description)


def _same_amounts(current: list, wanted: list[LineInput]) -> bool:
    key = lambda x: (x.account_id, x.debit, x.credit, x.bank_account_id, x.party_id)  # noqa: E731
    return len(current) == len(wanted) and all(key(a) == key(b) for a, b in zip(current, wanted))


class JournalEntryService:
    def __init__(self, session: AsyncSession) -> None:
        self.posting = PostingService(session)
        self.queries = LedgerQueryRepository(session)
        self.audit = AuditService(session)

    # ---------------------------------------------------------------- reads
    async def list_page(self, business_id: str, params: PageParams) -> JournalEntryListResponse:
        rows, total = await self.queries.journal_entry_page(
            business_id, DOCUMENT_TYPE, params.offset, params.page_size
        )
        items = [JournalEntryListItem.model_validate(r._mapping) for r in rows]
        return JournalEntryListResponse.build(items, total, params.page, params.page_size)

    async def get(self, business_id: str, document_id: str) -> JournalEntryResponse:
        return await self._response(await self._document(business_id, document_id))

    async def totals(self, business_id: str, lines: list[AmountsIn]) -> JournalTotalsResponse:
        """Server-computed form totals, rounded like a posting (the client never sums money)."""
        rounded = await self.posting.round_lines(
            business_id, [LineInput("", x.debit, x.credit) for x in lines]
        )
        debit, credit = totals(rounded)
        return JournalTotalsResponse(total_debit=debit, total_credit=credit, difference=debit - credit)

    # ---------------------------------------------------------------- writes
    async def create(self, ctx: BusinessContext, body: CreateJournalEntryRequest) -> JournalEntryResponse:
        lines = await self.posting.round_lines(ctx.business_id, _line_inputs(body.lines))
        document = await self.posting.create_document(
            ctx, DOCUMENT_TYPE, AREA, _header(body), lines, POSTED if body.post else DRAFT
        )
        if body.post:
            await self.posting.post(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "create", ENTITY, document.id, ctx.business_id, after=after)
        return after

    async def update(
        self, ctx: BusinessContext, document_id: str, body: UpdateJournalEntryRequest
    ) -> JournalEntryResponse:
        """Draft: replace. Posted: description-only edits stay in place (allowed when locked);
        any other change reverses the current entry and posts a new one (PR-73)."""
        document = await self._writable(ctx, document_id, body.version)
        before = await self._response(document)
        lines = await self.posting.round_lines(ctx.business_id, _line_inputs(body.lines))
        status = await self.posting.status_of(document)
        current = await self.posting.document_lines(document)
        if status == POSTED and self._only_descriptions_changed(document, current, body, lines):
            await self.posting.update_descriptions(ctx, document, body.description, [x.description for x in lines])
        else:
            await self.posting.update_document(ctx, document, _header(body), lines)
            if status == POSTED:
                await self.posting.repost(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "update", ENTITY, document.id, ctx.business_id,
                                before=before, after=after)
        return after

    async def post(self, ctx: BusinessContext, document_id: str, version: int) -> JournalEntryResponse:
        document = await self._writable(ctx, document_id, version)
        if await self.posting.status_of(document) != DRAFT:
            raise ConflictError("Only a draft can be posted", "document_not_draft")
        before = await self._response(document)
        await self.posting.post(ctx, document)
        await self.posting.set_status(ctx, document, POSTED)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "post", ENTITY, document.id, ctx.business_id,
                                before=before, after=after)
        return after

    async def void(self, ctx: BusinessContext, document_id: str, version: int) -> JournalEntryResponse:
        document = await self._writable(ctx, document_id, version)
        before = await self._response(document)
        await self.posting.void(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "void", ENTITY, document.id, ctx.business_id,
                                before=before, after=after)
        return after

    # ---------------------------------------------------------------- helpers
    async def _document(self, business_id: str, document_id: str, *, for_update: bool = False) -> Document:
        document = None
        if is_uuid(document_id):
            document = await self.posting.get_document(
                business_id, document_id, DOCUMENT_TYPE, for_update=for_update
            )
        if document is None:
            raise ResourceNotFoundError(ENTITY, document_id)
        return document

    async def _writable(self, ctx: BusinessContext, document_id: str, version: int) -> Document:
        """Row-locked, at the version the client read, and not void."""
        document = await self._document(ctx.business_id, document_id, for_update=True)
        check_version(document, version)
        if await self.posting.status_of(document) == VOID:
            raise ConflictError("A void journal entry cannot be changed", "document_void")
        return document

    @staticmethod
    def _only_descriptions_changed(
        document: Document, current: list, body: UpdateJournalEntryRequest, lines: list[LineInput]
    ) -> bool:
        return (
            document.document_date == body.date
            and (body.reference is None or body.reference == document.reference)
            and _same_amounts(current, lines)
        )

    async def _response(self, document: Document) -> JournalEntryResponse:
        dp = await self.posting.decimals(document.business_id)
        lines = [
            JournalEntryLineResponse.model_validate(
                {**r._mapping, "debit": round_money(r.debit, dp), "credit": round_money(r.credit, dp)}
            )
            for r in await self.queries.document_lines(document.business_id, document.id)
        ]
        debit, credit = totals(lines)
        lock = await self.posting.lock_date(document.business_id)
        return JournalEntryResponse(
            id=document.id,
            reference=document.reference,
            date=document.document_date,
            description=document.description,
            status=await self.posting.status_of(document),
            version=document.version,
            is_locked=lock is not None and document.document_date <= lock,
            lines=lines,
            total_debit=debit,
            total_credit=credit,
            difference=debit - credit,
            created_at=document.created_at,
            updated_at=document.updated_at,
        )

