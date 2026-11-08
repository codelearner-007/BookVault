"""COA response schemas: records, the chart tree and starting balances."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict

from app.schemas.common import MoneyOut, PaginatedResponse


class CoaGroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    name: str
    type: str
    parent_group_id: str | None
    root_key: str | None
    is_system: bool
    sort_order: int
    version: int


class CoaAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    name: str
    code: str | None
    group_id: str
    parent_id: str | None
    cash_flow_category: str | None
    type: str
    description: str | None
    is_system: bool
    is_active: bool
    sort_order: int
    version: int


class OpeningBalanceOut(BaseModel):
    side: str
    amount: MoneyOut


class CoaTreeAccount(BaseModel):
    id: str
    name: str
    code: str | None
    group_id: str
    type: str
    cash_flow_category: str | None
    description: str | None
    is_active: bool
    is_system: bool
    system_account_code: str | None
    sort_order: int
    version: int
    balance: MoneyOut
    is_used: bool
    can_have_opening_balance: bool
    opening_balance: OpeningBalanceOut | None


class CoaTreeGroup(BaseModel):
    """Balance = signed on the root's normal side (debit-positive for assets and expenses)."""

    id: str
    name: str
    root_key: str | None
    statement_type: str
    parent_group_id: str | None
    is_system: bool
    sort_order: int
    version: int
    balance: MoneyOut
    groups: list[CoaTreeGroup]
    accounts: list[CoaTreeAccount]


class CoaTreeResponse(BaseModel):
    as_at: date
    opening_date: date
    roots: list[CoaTreeGroup]


class StartingBalanceItem(BaseModel):
    account_id: str
    account_code: str | None
    account_name: str
    root_key: str
    group_name: str
    side: str | None
    amount: MoneyOut
    document_id: str | None


class RetainedEarningsEffect(BaseModel):
    side: str | None
    amount: MoneyOut


class StartingBalancesResponse(PaginatedResponse[StartingBalanceItem]):
    books_start_date: date
    opening_date: date
    retained_earnings_effect: RetainedEarningsEffect
