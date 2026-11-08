"""Withholding tax (B7): receipts (certificates) and settings.

Receipt (PR-36, T39): Dr Withholding tax / Cr Withholding tax receivable[customer]; the customer's
certificate clears what its invoices withheld (PR-21). BUG-01: the receivable setting never drops
the credit line; the system accounts exist from business creation, so a receipt always balances.
Settings: the receivable / payable flags only show the WHT fields on the forms; the base (D-27) is
gross incl. tax by default, or net before tax.
"""

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, LedgerValidationError, ResourceNotFoundError, VersionConflictError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.models.customer import Customer
from app.models.ledger import Document
from app.models.sales import WithholdingTaxReceipt
from app.repositories.business_settings_repository import BusinessSettingsRepository
from app.repositories.coa_repository import CoaRepository
from app.repositories.withholding_tax_repository import WithholdingTaxRepository
from app.schemas.request.withholding_tax import (
    CreateWithholdingTaxReceiptRequest,
    UpdateWithholdingTaxReceiptRequest,
    UpdateWithholdingTaxSettingsRequest,
    WithholdingTaxReceiptFields,
)
from app.schemas.response.withholding_tax import (
    WithholdingTaxReceiptListItem,
    WithholdingTaxReceiptListResponse,
    WithholdingTaxReceiptResponse,
    WithholdingTaxSettingsResponse,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.posting import DRAFT, POSTED, VOID, DocumentHeader, LineInput, PostingService
from app.services.versioning import check_version

TYPE, AREA, ENTITY = "withholding_tax_receipt", "withholding_tax_receipts", "WithholdingTaxReceipt"
CERTIFICATES, RECEIVABLE = "wht_certificates", "wht_receivable"
SETTINGS_ENTITY = "WithholdingTaxSettings"
ZERO = Decimal(0)


class WithholdingTaxService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = WithholdingTaxRepository(session)
        self.settings = BusinessSettingsRepository(session)
        self.coa = CoaRepository(session)
        self.posting = PostingService(session)
        self.audit = AuditService(session)
        self.session = session

    # ---------------------------------------------------------------- receipts
    async def list_page(self, business_id: str, party_id: str | None,
                        params: PageParams) -> WithholdingTaxReceiptListResponse:
        dp = await self.posting.decimals(business_id)
        rows, total, amount = await self.repo.list_page(business_id, party_id, params.offset, params.page_size)
        items = [WithholdingTaxReceiptListItem.model_validate({**r._mapping, "amount": round_money(r.amount, dp)})
                 for r in rows]
        return WithholdingTaxReceiptListResponse.build(items, total, params.page, params.page_size,
                                                       total_amount=round_money(amount, dp))

    async def get(self, business_id: str, document_id: str) -> WithholdingTaxReceiptResponse:
        return await self._response(await self._document(business_id, document_id))

    async def create(self, ctx: BusinessContext, body: CreateWithholdingTaxReceiptRequest) -> WithholdingTaxReceiptResponse:
        await self._check_customer(ctx.business_id, body)
        document = await self.posting.create_header(ctx, TYPE, AREA, _header(body), POSTED if body.post else DRAFT)
        await self.repo.add(WithholdingTaxReceipt(document_id=document.id, business_id=ctx.business_id,
                                                  party_id=body.customer_id, amount=body.amount))
        if body.post:
            await self._post(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "create", ENTITY, document.id, ctx.business_id, after=after)
        return after

    async def update(self, ctx: BusinessContext, document_id: str,
                     body: UpdateWithholdingTaxReceiptRequest) -> WithholdingTaxReceiptResponse:
        document = await self._writable(ctx, document_id, body.version)
        before = await self._response(document)
        await self._check_customer(ctx.business_id, body)
        await self.posting.update_header(ctx, document, _header(body))
        receipt = await self.repo.get(ctx.business_id, document.id)
        receipt.party_id, receipt.amount = body.customer_id, body.amount
        await self.repo.save()
        if before.status == POSTED:
            await self.posting.reverse_live_entry(ctx, document)
            await self._post(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "update", ENTITY, document.id, ctx.business_id, before=before, after=after)
        return after

    async def post(self, ctx: BusinessContext, document_id: str, version: int) -> WithholdingTaxReceiptResponse:
        document = await self._writable(ctx, document_id, version)
        if await self.posting.status_of(document) != DRAFT:
            raise ConflictError("Only a draft can be posted", "document_not_draft")
        before = await self._response(document)
        await self.posting.set_status(ctx, document, POSTED)
        await self._post(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "post", ENTITY, document.id, ctx.business_id, before=before, after=after)
        return after

    async def void(self, ctx: BusinessContext, document_id: str, version: int) -> WithholdingTaxReceiptResponse:
        document = await self._writable(ctx, document_id, version)
        before = await self._response(document)
        await self.posting.void(ctx, document)
        after = await self._response(document)
        await self.audit.record(ctx.user_id, "void", ENTITY, document.id, ctx.business_id, before=before, after=after)
        return after

    # ---------------------------------------------------------------- settings
    async def get_settings(self, business_id: str) -> WithholdingTaxSettingsResponse:
        row = await self.settings.get(business_id)
        return WithholdingTaxSettingsResponse(
            wht_receivable_enabled=row.wht_receivable_enabled, wht_payable_enabled=row.wht_payable_enabled,
            wht_base=row.wht_base_key, version=row.version)

    async def update_settings(self, ctx: BusinessContext,
                              body: UpdateWithholdingTaxSettingsRequest) -> WithholdingTaxSettingsResponse:
        before = await self.get_settings(ctx.business_id)
        sent = body.model_fields_set - {"version"}
        values = {key: getattr(body, key) for key in ("wht_receivable_enabled", "wht_payable_enabled")
                  if key in sent and getattr(body, key) is not None}
        if "wht_base" in sent and body.wht_base is not None:
            values["wht_base_key"] = body.wht_base
        if not await self.repo.update_settings(ctx.business_id, body.version, values):
            raise VersionConflictError()
        after = await self.get_settings(ctx.business_id)
        await self.audit.record(ctx.user_id, "update", SETTINGS_ENTITY, ctx.business_id, ctx.business_id,
                                before=before, after=after)
        return after

    # ---------------------------------------------------------------- helpers
    async def _post(self, ctx: BusinessContext, document: Document) -> None:
        receipt = await self.repo.get(ctx.business_id, document.id)
        certificates = await self.coa.system_account_id(ctx.business_id, CERTIFICATES)
        receivable = await self.coa.system_account_id(ctx.business_id, RECEIVABLE)
        await self.posting.post_lines(ctx, document, [
            LineInput(certificates, receipt.amount, ZERO),
            LineInput(receivable, ZERO, receipt.amount, party_id=receipt.party_id)])

    async def _check_customer(self, business_id: str, body: WithholdingTaxReceiptFields) -> None:
        customer = await self.session.get(Customer, body.customer_id) if is_uuid(body.customer_id) else None
        if customer is None or customer.business_id != business_id:
            raise LedgerValidationError("Choose a customer of this business", "customer_required")

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

    async def _response(self, document: Document) -> WithholdingTaxReceiptResponse:
        dp = await self.posting.decimals(document.business_id)
        row = await self.repo.detail(document.business_id, document.id)
        return WithholdingTaxReceiptResponse(
            id=document.id, reference=document.reference, date=document.document_date,
            status=await self.posting.status_of(document), version=document.version,
            is_locked=await self.posting.is_locked(document), customer_id=row.customer_id,
            customer_name=row.customer_name, amount=round_money(row.amount, dp), description=document.description,
            created_at=document.created_at, updated_at=document.updated_at)


def _header(body: WithholdingTaxReceiptFields) -> DocumentHeader:
    return DocumentHeader(body.date, body.reference, body.description)
