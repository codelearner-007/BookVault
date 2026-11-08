"""Summary report (Balance Sheet + Profit and Loss) response schemas (B2)."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

from app.schemas.common import MoneyOut


class SummaryAccount(BaseModel):
    id: str
    name: str
    code: str | None
    amount: MoneyOut


class SummaryGroup(BaseModel):
    id: str
    name: str
    total: MoneyOut
    groups: list[SummaryGroup]
    accounts: list[SummaryAccount]


class SummarySection(BaseModel):
    """A fixed root (Assets ... Expenses); amounts on the root's normal side."""

    root_key: str
    name: str
    total: MoneyOut
    groups: list[SummaryGroup]
    accounts: list[SummaryAccount]


class BalanceSheetSummary(BaseModel):
    sections: list[SummarySection]
    total_assets: MoneyOut
    total_liabilities: MoneyOut
    total_equity: MoneyOut
    total_liabilities_and_equity: MoneyOut
    is_balanced: bool


class ProfitAndLossSummary(BaseModel):
    sections: list[SummarySection]
    total_income: MoneyOut
    total_expenses: MoneyOut
    net_profit: MoneyOut


class RetainedEarningsSummary(BaseModel):
    """Computed, never stored (PR-70): the account's own lines + every P&L line up to `to`."""

    account_id: str
    ledger_balance: MoneyOut
    cumulative_profit: MoneyOut
    total: MoneyOut


class SummaryResponse(BaseModel):
    date_from: date = Field(serialization_alias="from")
    date_to: date = Field(serialization_alias="to")
    balance_sheet: BalanceSheetSummary
    profit_and_loss: ProfitAndLossSummary
    retained_earnings: RetainedEarningsSummary
