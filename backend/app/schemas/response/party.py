"""Party picker and capital account responses (B3)."""

from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import MoneyOut, PaginatedResponse


class PartyItem(BaseModel):
    id: str
    kind: str
    name: str
    code: str | None


class PartyListResponse(PaginatedResponse[PartyItem]):
    pass


class CapitalAccountResponse(BaseModel):
    id: str
    name: str
    code: str | None
    is_inactive: bool
    balance: MoneyOut  # ledger debit - credit (an owner's equity shows negative, as in Manager)
    version: int
    created_at: datetime
    updated_at: datetime


class CapitalAccountListResponse(PaginatedResponse[CapitalAccountResponse]):
    pass
