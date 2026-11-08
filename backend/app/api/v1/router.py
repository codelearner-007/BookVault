"""Main v1 API router."""

from fastapi import APIRouter, Depends

from app.api.v1 import (
    admin_tabs,
    attachments,
    audit,
    auth,
    bank_accounts,
    businesses,
    capital_accounts,
    cash_transactions,
    coa,
    countries,
    customers,
    country_templates,
    dashboard,
    journal_entries,
    late_payment_fees,
    ledger_reports,
    master_data,
    members,
    permissions,
    parties,
    profile,
    roles,
    sales,
    starting_balances,
    suppliers,
    suspense,
    tab_columns,
    transfers,
    user_roles,
    users,
)
from app.core.dependencies import enforce_rate_limit

# Every v1 route is rate limited per user (reads vs mutations, limits from settings).
api_router = APIRouter(prefix="/v1", dependencies=[Depends(enforce_rate_limit)])

for module in (
    auth, profile, roles, permissions, user_roles, users, audit, dashboard, members,
    businesses, coa, bank_accounts, tab_columns, transfers, capital_accounts, parties, attachments, suspense, admin_tabs, countries,
    journal_entries, ledger_reports, starting_balances, country_templates,
    customers, suppliers, master_data, late_payment_fees, sales,
):
    api_router.include_router(module.router)
api_router.include_router(cash_transactions.receipts_router)
api_router.include_router(cash_transactions.payments_router)
for trade_router in sales.trade_routers:
    api_router.include_router(trade_router)
