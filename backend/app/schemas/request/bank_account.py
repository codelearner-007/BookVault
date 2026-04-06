"""Bank account request schemas for input validation."""

from decimal import Decimal

from pydantic import BaseModel, Field


class BankAccountCreate(BaseModel):
    """Request body for creating a new bank account."""

    name: str = Field(..., min_length=1)
    opening_balance: Decimal = Field(default=Decimal("0"), ge=0)
    description: str | None = None


class BankAccountUpdate(BaseModel):
    """Request body for updating a bank account's name and description."""

    name: str | None = Field(None, min_length=1)
    description: str | None = None
