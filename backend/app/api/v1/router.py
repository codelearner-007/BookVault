"""Main v1 API router."""

from fastapi import APIRouter, Depends

from app.api.v1 import (
    admin_tabs,
    audit,
    auth,
    bank_accounts,
    businesses,
    coa,
    contacts,
    countries,
    dashboard,
    members,
    permissions,
    profile,
    receipts,
    roles,
    suspense,
    tab_columns,
    user_roles,
    users,
)
from app.core.dependencies import enforce_rate_limit

# Every v1 route is rate limited per user (reads vs mutations, limits from settings).
api_router = APIRouter(prefix="/v1", dependencies=[Depends(enforce_rate_limit)])

for module in (
    auth, profile, roles, permissions, user_roles, users, audit, dashboard, members,
    businesses, coa, bank_accounts, receipts, tab_columns, suspense, admin_tabs, countries,
):
    api_router.include_router(module.router)
api_router.include_router(contacts.customers_router)
api_router.include_router(contacts.suppliers_router)
