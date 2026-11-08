"""Per-document History (audit rows), Restore this version and Restore a deleted document."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.inventory import BODIES as STOCK_BODIES
from app.api.v1.sales import BODIES as TRADE_BODIES
from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_document_access, require_idempotency_key
from app.core.pagination import PageParams, page_params
from app.schemas.common import PaginatedResponse
from app.schemas.request.cash_transaction import UpdateCashTransactionRequest
from app.schemas.request.document_history import RestoreVersionRequest
from app.schemas.request.journal_entry import DocumentActionRequest, UpdateJournalEntryRequest
from app.schemas.request.sales import UpdateLateFeeRequest
from app.schemas.request.transfer import UpdateTransferRequest
from app.schemas.request.withholding_tax import UpdateWithholdingTaxReceiptRequest
from app.schemas.response.audit import AuditLogResponse
from app.services.access_service import BusinessContext
from app.services.cash_transaction_service import PAYMENT, RECEIPT, CashTransactionService
from app.services.document_history_service import DocumentHandler, DocumentHistoryService
from app.services.idempotency_service import IdempotencyService, business_scope
from app.services.journal_entry_service import DOCUMENT_TYPE as JOURNAL_ENTRY, JournalEntryService
from app.services.late_payment_fee_service import TYPE as LATE_FEE, LatePaymentFeeService
from app.services.stock_document_service import STOCK_KINDS, StockDocumentService
from app.services.trade_document_service import TradeDocumentService
from app.services.trade_types import TRADE_TYPES
from app.services.transfer_service import DOCUMENT_TYPE as TRANSFER, TransferService
from app.services.withholding_tax_service import TYPE as WHT_RECEIPT, WithholdingTaxService

HANDLERS: dict[str, DocumentHandler] = {
    RECEIPT: DocumentHandler(lambda db: CashTransactionService(db, RECEIPT), UpdateCashTransactionRequest),
    PAYMENT: DocumentHandler(lambda db: CashTransactionService(db, PAYMENT), UpdateCashTransactionRequest),
    JOURNAL_ENTRY: DocumentHandler(JournalEntryService, UpdateJournalEntryRequest),
    TRANSFER: DocumentHandler(TransferService, UpdateTransferRequest),
    WHT_RECEIPT: DocumentHandler(WithholdingTaxService, UpdateWithholdingTaxReceiptRequest),
    LATE_FEE: DocumentHandler(LatePaymentFeeService, UpdateLateFeeRequest),
    **{key: DocumentHandler(lambda db, kind=TRADE_TYPES[key]: TradeDocumentService(db, kind), bodies[1])
       for key, bodies in TRADE_BODIES.items()},
    **{key: DocumentHandler(lambda db, kind=STOCK_KINDS[key]: StockDocumentService(db, kind), bodies[1])
       for key, bodies in STOCK_BODIES.items()},
}

router = APIRouter(prefix="/businesses/{business_id}/documents/{document_id}", tags=["Document History"])


def _service(db: AsyncSession) -> DocumentHistoryService:
    return DocumentHistoryService(db, HANDLERS)


@router.get("/history", response_model=PaginatedResponse[AuditLogResponse])
async def document_history(
    document_id: str,
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_document_access(AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> PaginatedResponse[AuditLogResponse]:
    """Every change of this document, newest first (who, when, action, before / after)."""
    await _service(db).document(ctx.business_id, document_id)
    return await _service(db).history(ctx.business_id, document_id, params)


@router.post("/restore-version")
async def restore_document_version(
    document_id: str,
    body: RestoreVersionRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_document_access(AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """A new edit that brings the document back to that version (posted: reversal + repost)."""
    service = _service(db)
    document, type_key = await service.document(ctx.business_id, document_id)
    return await IdempotencyService(db).run(
        business_scope(ctx, key, document.area_key, f"POST documents/{document_id}/restore-version"), body,
        lambda: service.restore_version(ctx, document, type_key, body.audit_id, body.version),
        status_code=200,
    )


@router.post("/restore")
async def restore_deleted_document(
    document_id: str,
    body: DocumentActionRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_document_access(AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """Bring back a deleted document (reposted when it had been posted)."""
    service = _service(db)
    document, type_key = await service.document(ctx.business_id, document_id)
    return await IdempotencyService(db).run(
        business_scope(ctx, key, document.area_key, f"POST documents/{document_id}/restore"), body,
        lambda: service.restore_deleted(ctx, document, type_key, body.version),
        status_code=200,
    )
