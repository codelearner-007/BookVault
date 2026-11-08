"""Ledger reports (Trial Balance, GL Transactions, Summary) and book settings endpoints (B1, B2)."""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access
from app.core.pagination import PageParams, page_params
from app.schemas.common import IdStr
from app.schemas.request.journal_entry import UpdateBooksSettingsRequest
from app.schemas.response.summary import SummaryResponse
from app.schemas.response.journal_entry import (
    BooksSettingsResponse,
    GeneralLedgerTransactionsResponse,
    TrialBalanceResponse,
)
from app.services.access_service import BusinessContext
from app.services.books_settings_service import BooksSettingsService
from app.services.ledger_report_service import REPORTS_AREA, LedgerReportService
from app.services.summary_service import SummaryService

BOOKS_AREA = "settings.lock_date"
SUMMARY_AREA = "summary"

router = APIRouter(prefix="/businesses/{business_id}", tags=["Ledger Reports"])


@router.get("/reports/trial-balance", response_model=TrialBalanceResponse)
async def trial_balance(
    as_at: date = Query(...),
    ctx: BusinessContext = Depends(require_business_access(REPORTS_AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> TrialBalanceResponse:
    return await LedgerReportService(db).trial_balance(ctx.business_id, as_at)


@router.get("/reports/general-ledger-transactions", response_model=GeneralLedgerTransactionsResponse)
async def general_ledger_transactions(
    date_from: date = Query(..., alias="from"),
    date_to: date = Query(..., alias="to"),
    account_id: IdStr | None = Query(None),
    include_reversed: bool = Query(False),
    params: PageParams = Depends(page_params),
    ctx: BusinessContext = Depends(require_business_access(REPORTS_AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> GeneralLedgerTransactionsResponse:
    return await LedgerReportService(db).general_ledger_transactions(
        ctx.business_id, date_from, date_to, account_id, include_reversed, params
    )


@router.get("/reports/summary", response_model=SummaryResponse)
async def summary(
    date_from: date = Query(..., alias="from"),
    date_to: date = Query(..., alias="to"),
    ctx: BusinessContext = Depends(require_business_access(SUMMARY_AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> SummaryResponse:
    """Balance Sheet as at `to` and Profit and Loss for the period, from the ledger."""
    return await SummaryService(db).summary(ctx.business_id, date_from, date_to)


@router.get("/settings/books", response_model=BooksSettingsResponse)
async def get_books_settings(
    ctx: BusinessContext = Depends(require_business_access(BOOKS_AREA, AreaRight.VIEW)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> BooksSettingsResponse:
    return await BooksSettingsService(db).get(ctx.business_id)


@router.put("/settings/books", response_model=BooksSettingsResponse)
async def update_books_settings(
    body: UpdateBooksSettingsRequest,
    ctx: BusinessContext = Depends(require_business_access(BOOKS_AREA, AreaRight.EDIT)),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> BooksSettingsResponse:
    return await BooksSettingsService(db).update(ctx, body)
