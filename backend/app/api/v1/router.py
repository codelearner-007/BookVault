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
    contacts,
    countries,
    country_templates,
    dashboard,
    journal_entries,
    ledger_reports,
    members,
    permissions,
    parties,
    profile,
    roles,
    starting_balances,
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
):
    api_router.include_router(module.router)
api_router.include_router(cash_transactions.receipts_router)
api_router.include_router(cash_transactions.payments_router)
api_router.include_router(contacts.customers_router)
api_router.include_router(contacts.suppliers_router)
