"""Main v1 API router."""

from fastapi import APIRouter

from app.api.v1 import (
    members,
    admin_tabs,
    audit,
    auth,
    bank_accounts,
    businesses,
    coa,
    customers,
    dashboard,
    modules,
    permissions,
    profile,
    receipts,
    roles,
    suppliers,
    suspense,
    tab_columns,
    user_roles,
    users,
)

# Create v1 router
api_router = APIRouter(prefix="/v1")

# Include sub-routers
api_router.include_router(auth.router)
api_router.include_router(profile.router)
api_router.include_router(roles.router)
api_router.include_router(permissions.router)
api_router.include_router(user_roles.router)
api_router.include_router(users.router)
api_router.include_router(audit.router)
api_router.include_router(dashboard.router)
api_router.include_router(modules.router)
api_router.include_router(members.router)
api_router.include_router(businesses.router)
api_router.include_router(coa.router)
api_router.include_router(bank_accounts.router)
api_router.include_router(customers.router)
api_router.include_router(suppliers.router)
api_router.include_router(receipts.router)
api_router.include_router(tab_columns.router)
api_router.include_router(suspense.router)
api_router.include_router(admin_tabs.router)
