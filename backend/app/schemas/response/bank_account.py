"""Bank account response schemas for API output serialization."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class BankAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    name: str
    opening_balance: Decimal
    current_balance: Decimal
    description: str | None
    created_at: datetime
    updated_at: datetime


class BankAccountListResponse(BaseModel):
    items: list[BankAccountResponse]
    total: int
    coa_total: Decimal
