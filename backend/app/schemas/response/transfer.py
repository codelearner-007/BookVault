"""Inter-account transfer responses."""

from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.common import MoneyOut, PaginatedResponse


class TransferResponse(BaseModel):
    id: str
    reference: str | None
    date: date
    status: str
    version: int
    is_locked: bool
    description: str | None
    from_bank_account_id: str
    from_bank_account_name: str | None
    from_can_have_pending: bool
    to_bank_account_id: str
    to_bank_account_name: str | None
    to_can_have_pending: bool
    amount: MoneyOut
    from_clears_later: bool
    from_cleared_on: date | None
    to_clears_later: bool
    to_cleared_on: date | None
    created_at: datetime
    updated_at: datetime


class TransferListItem(BaseModel):
    id: str
    reference: str | None
    date: date
    status: str
    from_bank_account_id: str
    from_bank_account_name: str | None
    to_bank_account_id: str
    to_bank_account_name: str | None
    description: str | None
    amount: MoneyOut
    version: int


class TransferListResponse(PaginatedResponse[TransferListItem]):
    total_amount: MoneyOut
