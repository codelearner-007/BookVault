"""Bank account response schemas (money as decimal strings)."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import MoneyOut, PaginatedResponse


class BankAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    name: str
    opening_balance: MoneyOut
    current_balance: MoneyOut
    description: str | None
    version: int
    created_at: datetime
    updated_at: datetime


class BankAccountListResponse(PaginatedResponse[BankAccountResponse]):
    """Page of accounts plus the balance of all accounts of the business."""

    coa_total: MoneyOut
