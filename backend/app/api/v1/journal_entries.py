"""Journal Entries endpoints (B1): drafts, post, edit, void, totals, Transaction Journal."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import (
    get_db,
    require_business_access,
    require_business_member,
    require_idempotency_key,
)
from app.core.pagination import PageParams, page_params
from app.schemas.request.journal_entry import (
    CreateJournalEntryRequest,
    DocumentActionRequest,
    JournalTotalsRequest,
    UpdateJournalEntryRequest,
)
from app.schemas.response.journal_entry import (
    JournalEntryListResponse,
    JournalEntryResponse,
    JournalTotalsResponse,
    TransactionJournalResponse,
)
from app.services.access_service import BusinessContext
from app.services.idempotency_service import IdempotencyService, business_scope
from app.services.journal_entry_service import AREA, JournalEntryService
from app.services.ledger_report_service import LedgerReportService

router = APIRouter(prefix="/businesses/{business_id}", tags=["Journal Entries"])
BASE = "/journal-entries"


@router.get(BASE, response_model=JournalEntryListResponse)
async def list_journal_entries(
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> JournalEntryListResponse:
    return await JournalEntryService(db).list_page(ctx.business_id, params)


@router.post(BASE, response_model=JournalEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_journal_entry(
    body: CreateJournalEntryRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.CREATE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> JournalEntryResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, "POST journal-entries"),
        body,
        lambda: JournalEntryService(db).create(ctx, body),
    )


@router.post(BASE + "/totals", response_model=JournalTotalsResponse)
async def journal_entry_totals(
    body: JournalTotalsRequest,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> JournalTotalsResponse:
    """Totals and difference of the lines on the form, rounded like a posting (no write)."""
    return await JournalEntryService(db).totals(ctx.business_id, body.lines)


@router.get(BASE + "/{document_id}", response_model=JournalEntryResponse)
async def get_journal_entry(
    document_id: str,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> JournalEntryResponse:
    return await JournalEntryService(db).get(ctx.business_id, document_id)


@router.put(BASE + "/{document_id}", response_model=JournalEntryResponse)
async def update_journal_entry(
    document_id: str,
    body: UpdateJournalEntryRequest,
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> JournalEntryResponse:
    return await JournalEntryService(db).update(ctx, document_id, body)


@router.post(BASE + "/{document_id}/post", response_model=JournalEntryResponse)
async def post_journal_entry(
    document_id: str,
    body: DocumentActionRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> JournalEntryResponse:
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, f"POST journal-entries/{document_id}/post"),
        body,
        lambda: JournalEntryService(db).post(ctx, document_id, body.version),
        status_code=status.HTTP_200_OK,
    )


@router.post(BASE + "/{document_id}/void", response_model=JournalEntryResponse)
async def void_journal_entry(
    document_id: str,
    body: DocumentActionRequest,
    key: str = Depends(require_idempotency_key),
    ctx: BusinessContext = Depends(require_business_access(AREA, AreaRight.DELETE)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> JournalEntryResponse:
    """Posted: reversal entry + status void. Draft: discarded (void, no ledger effect)."""
    return await IdempotencyService(db).run(
        business_scope(ctx, key, AREA, f"POST journal-entries/{document_id}/void"),
        body,
        lambda: JournalEntryService(db).void(ctx, document_id, body.version),
        status_code=status.HTTP_200_OK,
    )


@router.get("/documents/{document_id}/journal", response_model=TransactionJournalResponse)
async def document_journal(
    document_id: str,
    ctx: BusinessContext = Depends(require_business_member()),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TransactionJournalResponse:
    """Transaction Journal: view on the document's area (checked in the service) or reports."""
    return await LedgerReportService(db).journal(ctx, document_id)
