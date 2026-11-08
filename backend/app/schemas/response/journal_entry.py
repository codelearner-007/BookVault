"""Journal entry, transaction journal, ledger report and book-settings responses (B1)."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import MoneyOut, PaginatedResponse


class LedgerLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    line_no: int
    account_id: str
    account_code: str | None
    account_name: str
    description: str | None
    debit: MoneyOut
    credit: MoneyOut


class JournalEntryLineResponse(LedgerLineResponse):
    id: str


class JournalTotalsResponse(BaseModel):
    total_debit: MoneyOut
    total_credit: MoneyOut
    difference: MoneyOut


class JournalEntryResponse(JournalTotalsResponse):
    id: str
    reference: str | None
    date: date
    description: str | None
    status: str
    version: int
    is_locked: bool
    lines: list[JournalEntryLineResponse]
    created_at: datetime
    updated_at: datetime


class JournalEntryListItem(BaseModel):
    id: str
    reference: str | None
    date: date
    description: str | None
    status: str
    amount: MoneyOut
    version: int


class JournalEntryListResponse(PaginatedResponse[JournalEntryListItem]):
    pass


class JournalPostingResponse(BaseModel):
    id: str
    entry_date: date
    source: str
    reverses_entry_id: str | None
    posted_at: datetime
    lines: list[LedgerLineResponse]
    total_debit: MoneyOut
    total_credit: MoneyOut


class TransactionJournalResponse(BaseModel):
    document_id: str
    entries: list[JournalPostingResponse]


class TrialBalanceRow(BaseModel):
    account_id: str
    account_code: str | None
    account_name: str
    account_type: str
    debit: MoneyOut
    credit: MoneyOut


class TrialBalanceResponse(BaseModel):
    as_at: date
    rows: list[TrialBalanceRow]
    total_debit: MoneyOut
    total_credit: MoneyOut


class GeneralLedgerTransaction(BaseModel):
    journal_line_id: str
    entry_id: str
    document_id: str
    date: date
    reference: str | None
    document_type: str
    description: str | None
    account_id: str
    account_code: str | None
    account_name: str
    debit: MoneyOut
    credit: MoneyOut
    source: str


class GeneralLedgerTransactionsResponse(PaginatedResponse[GeneralLedgerTransaction]):
    pass


class BooksSettingsResponse(BaseModel):
    books_start_date: date
    lock_date: date | None
    version: int
