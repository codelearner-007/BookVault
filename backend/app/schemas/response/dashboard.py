"""Dashboard response schemas for API output serialization."""

from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.common import MoneyOut, PaginatedResponse


class DashboardStatsResponse(BaseModel):
    """The caller's own numbers (CS-21): never platform-wide counts."""

    total_businesses: int
    total_audit_logs: int
    recent_activity_24h: int


class BusinessFigures(BaseModel):
    """Headline figures from the ledger in the business's base currency; null = no right to view it."""

    cash_and_bank: MoneyOut | None
    receivables: MoneyOut | None
    payables: MoneyOut | None
    net_profit: MoneyOut | None
    suspense: MoneyOut | None
    overdue_invoices: int | None  # posted sales invoices past their due date with a balance due
    overdue_amount: MoneyOut | None


class DashboardBusiness(BaseModel):
    id: str
    name: str
    country: str | None
    currency_code: str | None
    decimal_places: int
    number_format: str | None
    is_owner: bool
    member_count: int | None  # owners only
    last_activity_at: datetime | None  # latest event the caller may read
    figures: BusinessFigures


class DashboardActivity(BaseModel):
    id: str
    business_id: str
    business_name: str
    action: str
    entity_type: str
    entity_id: str | None
    record_label: str | None
    is_mine: bool
    performed_by: str | None
    created_at: datetime


class WorkspaceDashboardResponse(PaginatedResponse[DashboardBusiness]):
    """GET /me/dashboard: a page of my businesses with figures, plus recent activity across all of them."""

    as_at: date
    period_from: date  # start of the net profit period (1 January, as the Summary tab)
    activity: list[DashboardActivity]
