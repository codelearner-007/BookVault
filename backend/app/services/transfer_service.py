"""Inter-account transfers (B3, PR-10, PR-12): one entry, two Cash & cash equivalents lines.

Dr Cash & cash equivalents[received in] / Cr Cash & cash equivalents[paid from]; no
"Inter Account Transfers" account (BV-04). Per-side clear dates never touch the ledger.
"""

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, LedgerValidationError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.models.banking import InterAccountTransfer
from app.models.ledger import Document
from app.repositories.bank_account_repository import BankAccountRepository
from app.repositories.coa_repository import CoaRepository
from app.repositories.transfer_repository import TransferRepository
from app.schemas.request.transfer import CreateTransferRequest, TransferFields, UpdateTransferRequest
from app.schemas.response.transfer import TransferListItem, TransferListResponse, TransferResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.posting import DRAFT, POSTED, VOID, DocumentHeader, LineInput, PostingService
from app.services.versioning import check_version

DOCUMENT_TYPE = "inter_account_transfer"
AREA = "inter_account_transfers"
ENTITY = "InterAccountTransfer"
CASH_CONTROL = "cash_control"
ZERO = Decimal(0)


class TransferService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = TransferRepository(session)
        self.banks = BankAccountRepository(session)
        self.coa = CoaRepository(session)
        self.posting = PostingService(session)
        self.audit = AuditService(session)

    # ---------------------------------------------------------------- reads
    async def list_page(self, business_id: str, params: PageParams) -> TransferListResponse:
        dp = await self.posting.decimals(business_id)
        rows, total, amount = await self.repo.list_page(business_id, params.offset, params.page_size)
        items = [TransferListItem.model_validate({**r._mapping, "amount": round_money(r.amount, dp)}) for r in rows]
        return TransferListResponse.build(items, total, params.page, params.page_size,
                                          total_amount=round_money(amount, dp))

    async def get(self, business_id: str, document_id: str) -> TransferResponse:
        return await self._response(await self._document(business_id, document_id))

    # ---------------------------------------------------------------- writes
    async def create(self, ctx: BusinessContext, body: CreateTransferRequest) -> TransferResponse:
        await self.posting.assert_open(ctx.business_id, body.date)
        amount, ledger = await self._prepare(ctx.business_id, body)
        document = await self.posting.create_header(
            ctx, DOCUMENT_TYPE, AREA, _header(body), POSTED if body.post else DRAFT
        )
        extension = InterAccountTransfer(document_id=document.id, business_id=ctx.business_id)
        _apply(extension, body, amount)
        await self.repo.add(extension)
        if body.post:
            await self.posting.post_lines(ctx, document, ledger)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "create", ENTITY, document.id, ctx.business_id, after=after)
        return after

    async def update(self, ctx: BusinessContext, document_id: str, body: UpdateTransferRequest) -> TransferResponse:
        document = await self._writable(ctx, document_id, body.version)
        before = await self._response(document)
        await self.posting.assert_open(ctx.business_id, document.document_date, body.date)
        amount, ledger = await self._prepare(ctx.business_id, body)
        posted = await self.posting.status_of(document) == POSTED
        extension = await self.repo.get(ctx.business_id, document.id)
        same = (posted and document.document_date == body.date
                and (body.reference is None or body.reference == document.reference)
                and [x.ledger_key() for x in await self.posting.live_lines(document)]
                == [x.ledger_key() for x in ledger])
        if same:
            await self.posting.update_descriptions(ctx, document, body.description)
        else:
            await self.posting.update_header(ctx, document, _header(body))
        _apply(extension, body, amount)
        await self.repo.save()
        if posted and not same:
            await self.posting.repost_lines(ctx, document, ledger)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "update", ENTITY, document.id, ctx.business_id,
                                before=before, after=after)
        return after

    async def post(self, ctx: BusinessContext, document_id: str, version: int) -> TransferResponse:
        document = await self._writable(ctx, document_id, version)
        if await self.posting.status_of(document) != DRAFT:
            raise ConflictError("Only a draft can be posted", "document_not_draft")
        before = await self._response(document)
        extension = await self.repo.get(ctx.business_id, document.id)
        ledger = await self._ledger(ctx.business_id, extension.from_bank_account_id,
                                    extension.to_bank_account_id, extension.amount_sent)
        await self.posting.post_lines(ctx, document, ledger)
        await self.posting.set_status(ctx, document, POSTED)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "post", ENTITY, document.id, ctx.business_id,
                                before=before, after=after)
        return after

    async def void(self, ctx: BusinessContext, document_id: str, version: int) -> TransferResponse:
        document = await self._writable(ctx, document_id, version)
        before = await self._response(document)
        await self.posting.void(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "void", ENTITY, document.id, ctx.business_id,
                                before=before, after=after)
        return after

    # ---------------------------------------------------------------- helpers
    async def _prepare(self, business_id: str, body: TransferFields) -> tuple[Decimal, list[LineInput]]:
        if body.from_bank_account_id == body.to_bank_account_id:
            raise LedgerValidationError("Choose two different accounts", "same_bank_account")
        sides = [(body.from_bank_account_id, body.from_clears_later), (body.to_bank_account_id, body.to_clears_later)]
        for bank_id, clears_later in sides:
            bank = await self.banks.get(business_id, bank_id)
            if bank is None:
                raise LedgerValidationError("Choose a bank or cash account of this business", "bank_account_required")
            if clears_later and not bank.can_have_pending:
                raise LedgerValidationError(
                    "This bank or cash account cannot have pending transactions", "cleared_not_allowed")
        amount = round_money(body.amount, await self.posting.decimals(business_id))
        if amount <= 0:
            raise LedgerValidationError("The amount must be more than zero", "total_not_positive")
        return amount, await self._ledger(business_id, body.from_bank_account_id, body.to_bank_account_id, amount)

    async def _ledger(self, business_id: str, from_id: str, to_id: str, amount: Decimal) -> list[LineInput]:
        cash = await self.coa.system_account_id(business_id, CASH_CONTROL)
        lines = [LineInput(cash, amount, ZERO, bank_account_id=to_id),
                 LineInput(cash, ZERO, amount, bank_account_id=from_id)]
        await self.posting.assert_lines(business_id, lines)
        return lines

    async def _document(self, business_id: str, document_id: str, *, for_update: bool = False) -> Document:
        document = None
        if is_uuid(document_id):
            document = await self.posting.get_document(business_id, document_id, DOCUMENT_TYPE,
                                                       for_update=for_update)
        if document is None:
            raise ResourceNotFoundError(ENTITY, document_id)
        return document

    async def _writable(self, ctx: BusinessContext, document_id: str, version: int) -> Document:
        document = await self._document(ctx.business_id, document_id, for_update=True)
        check_version(document, version)
        if await self.posting.status_of(document) == VOID:
            raise ConflictError("A void transfer cannot be changed", "document_void")
        return document

    async def _response(self, document: Document) -> TransferResponse:
        dp = await self.posting.decimals(document.business_id)
        x = await self.repo.get(document.business_id, document.id)
        names = await self.repo.names(document.business_id, document.id)
        return TransferResponse(
            id=document.id, reference=document.reference, date=document.document_date,
            status=await self.posting.status_of(document), version=document.version,
            is_locked=await self.posting.is_locked(document), description=document.description,
            from_bank_account_id=x.from_bank_account_id, from_bank_account_name=names.from_name,
            from_can_have_pending=bool(names.from_pending), to_bank_account_id=x.to_bank_account_id,
            to_bank_account_name=names.to_name, to_can_have_pending=bool(names.to_pending),
            amount=round_money(x.amount_sent, dp), from_clears_later=x.from_clears_later,
            from_cleared_on=x.from_cleared_on, to_clears_later=x.to_clears_later, to_cleared_on=x.to_cleared_on,
            created_at=document.created_at, updated_at=document.updated_at,
        )


def _header(body: TransferFields) -> DocumentHeader:
    return DocumentHeader(body.date, body.reference, body.description)


def _apply(extension: InterAccountTransfer, body: TransferFields, amount: Decimal) -> None:
    extension.from_bank_account_id = body.from_bank_account_id
    extension.to_bank_account_id = body.to_bank_account_id
    extension.amount_sent = amount
    extension.amount_received = amount
    extension.from_clears_later = body.from_clears_later
    extension.from_cleared_on = body.from_cleared_on
    extension.to_clears_later = body.to_clears_later
    extension.to_cleared_on = body.to_cleared_on
