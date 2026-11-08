"""Receipt service: validation, server-computed totals, versioned writes, audit."""

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundError, ValidationError
from app.core.ids import is_uuid
from app.core.money import round_money, to_storage
from app.core.pagination import PageParams
from app.models.receipt import Receipt
from app.repositories.bank_account_repository import BankAccountRepository
from app.repositories.coa_repository import CoaRepository
from app.repositories.contact_repository import ContactRepository
from app.repositories.receipt_repository import ReceiptRepository
from app.schemas.common import PaginatedResponse
from app.schemas.request.receipt import ReceiptCreate, ReceiptLineItem, ReceiptUpdate
from app.schemas.response.receipt import ReceiptResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.contact_service import CONTACT_KINDS
from app.services.versioning import changed_fields, check_version

SUSPENSE_ACCOUNT_KEY = "suspense"
ENTITY = "Receipt"


def line_total(line: ReceiptLineItem) -> Decimal:
    """amount x qty - discount, rounded half away from zero; the client total is ignored."""
    qty = line.qty if line.qty is not None else Decimal("1")
    return round_money(line.amount * qty - (line.discount or Decimal("0")))


def stored_lines(lines: list[ReceiptLineItem]) -> list[dict]:
    """jsonb representation: money as decimal strings, totals computed here (AC-22)."""
    return [
        {
            "account_id": line.account_id,
            "line_description": line.line_description,
            "qty": to_storage(line.qty) if line.qty is not None else None,
            "discount": to_storage(line.discount) if line.discount is not None else None,
            "amount": to_storage(line.amount),
            "total": to_storage(line_total(line)),
        }
        for line in lines
    ]


class ReceiptService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = ReceiptRepository(session)
        self.bank_account_repo = BankAccountRepository(session)
        self.coa_repo = CoaRepository(session)
        self.session = session
        self.audit = AuditService(session)

    async def _validate_references(self, business_id: str, fields: dict) -> None:
        """Reject ids that are not records of this business (CS-05, AC-02)."""
        account_id = fields.get("received_in_account_id")
        if account_id and not await self.bank_account_repo.get(business_id, account_id):
            raise ValidationError(
                "Received-in account not found in this business", "received_in_account_id"
            )
        contact_id = fields.get("paid_by_contact_id")
        if contact_id:
            kind = CONTACT_KINDS.get(fields.get("paid_by_contact_type"))
            if not kind or not await ContactRepository(self.session, kind.model).get(
                business_id, contact_id
            ):
                raise ValidationError("Contact not found in this business", "paid_by_contact_id")
        line_account_ids = {
            line.account_id for line in fields.get("lines") or []
            if line.account_id != SUSPENSE_ACCOUNT_KEY
        }
        if not line_account_ids:
            return
        if not all(is_uuid(a) for a in line_account_ids) or (
            await self.coa_repo.existing_account_ids(business_id, line_account_ids)
            != line_account_ids
        ):
            raise ValidationError("Line account not found in this business", "lines")

    async def _get_or_404(self, business_id: str, receipt_id: str) -> Receipt:
        receipt = await self.repo.get(business_id, receipt_id)
        if receipt is None:
            raise ResourceNotFoundError(ENTITY, receipt_id)
        return receipt

    async def _read(self, business_id: str, receipt_id: str) -> ReceiptResponse:
        row = await self.repo.get_with_names(business_id, receipt_id)
        if row is None:
            raise ResourceNotFoundError(ENTITY, receipt_id)
        return ReceiptResponse.model_validate(row)

    async def list_page(
        self, business_id: str, params: PageParams, contact: tuple[str, str] | None = None
    ) -> PaginatedResponse[ReceiptResponse]:
        rows, total = await self.repo.list_page(business_id, params.offset, params.page_size, contact)
        items = [ReceiptResponse.model_validate(r) for r in rows]
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def get(self, business_id: str, receipt_id: str) -> ReceiptResponse:
        return await self._read(business_id, receipt_id)

    async def create(self, ctx: BusinessContext, body: ReceiptCreate) -> ReceiptResponse:
        await self._validate_references(ctx.business_id, dict(body))
        receipt = Receipt(
            business_id=ctx.business_id,
            **body.model_dump(exclude={"lines"}),
            lines=stored_lines(body.lines),
        )
        await self.repo.add(receipt)
        after = await self._read(ctx.business_id, receipt.id)
        await self.audit.record(ctx.user_id, "create", ENTITY, receipt.id, ctx.business_id, after=after)
        return after

    async def update(self, ctx: BusinessContext, receipt_id: str, body: ReceiptUpdate) -> ReceiptResponse:
        receipt = await self._get_or_404(ctx.business_id, receipt_id)
        check_version(receipt, body.version)
        before = await self._read(ctx.business_id, receipt_id)
        fields = changed_fields(body, required=("date", "paid_by_type", "lines"))
        await self._validate_references(ctx.business_id, {
            "paid_by_contact_id": receipt.paid_by_contact_id,
            "paid_by_contact_type": receipt.paid_by_contact_type,
            **fields,
        })
        if "lines" in fields:
            fields["lines"] = stored_lines(body.lines)
        for key, value in fields.items():
            setattr(receipt, key, value)
        await self.repo.save()
        after = await self._read(ctx.business_id, receipt_id)
        await self.audit.record(ctx.user_id, "update", ENTITY, receipt_id, ctx.business_id,
                                before=before, after=after)
        return after

    async def delete(self, ctx: BusinessContext, receipt_id: str, version: int) -> None:
        receipt = await self._get_or_404(ctx.business_id, receipt_id)
        check_version(receipt, version)
        before = await self._read(ctx.business_id, receipt_id)
        await self.repo.delete(receipt)
        await self.audit.record(ctx.user_id, "delete", ENTITY, receipt_id, ctx.business_id,
                                before=before)
