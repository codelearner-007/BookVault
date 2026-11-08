"""Chart of Accounts endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.dependencies import get_db, require_business_access
from app.services.access_service import BusinessContext
from app.schemas.request.coa import (
    CoaAccountCreate,
    CoaAccountUpdate,
    CoaAccountsOrderUpdate,
    CoaGroupCreate,
    CoaGroupUpdate,
    CoaGroupsOrderUpdate,
)
from app.schemas.response.coa import (
    CoaAccountListResponse,
    CoaAccountResponse,
    CoaGroupListResponse,
    CoaGroupResponse,
)
from app.services.coa_service import CoaService

router = APIRouter(
    prefix="/businesses/{business_id}/chart-of-accounts",
    tags=["Chart of Accounts"],
)

_AREA = "settings.chart_of_accounts"
_COA_VIEW = require_business_access(_AREA, AreaRight.VIEW)
_COA_CREATE = require_business_access(_AREA, AreaRight.CREATE)
_COA_EDIT = require_business_access(_AREA, AreaRight.EDIT)
_COA_DELETE = require_business_access(_AREA, AreaRight.DELETE)



# -------------------------------------------------------------------- Groups


@router.get(
    "/groups",
    response_model=CoaGroupListResponse,
)
async def list_groups(
    business_id: str,
    ctx: BusinessContext = Depends(_COA_VIEW),
    db: AsyncSession = Depends(get_db),
) -> CoaGroupListResponse:
    """List all COA groups for a business owned by the requesting user."""
    return await CoaService(db).list_groups(business_id, ctx.owner_id)


@router.post(
    "/groups",
    response_model=CoaGroupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_group(
    business_id: str,
    body: CoaGroupCreate,
    ctx: BusinessContext = Depends(_COA_CREATE),
    db: AsyncSession = Depends(get_db),
) -> CoaGroupResponse:
    """Create a new COA group under the given business."""
    return await CoaService(db).create_group(
        business_id=business_id,
        owner_id=ctx.owner_id,
        name=body.name,
        type_=body.type,
        parent_group_id=body.parent_group_id,
    )


@router.put(
    "/groups/order",
)
async def reorder_groups(
    business_id: str,
    body: CoaGroupsOrderUpdate,
    ctx: BusinessContext = Depends(_COA_EDIT),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Reorder COA groups within a type/parent bucket."""
    await CoaService(db).reorder_groups(
        business_id=business_id,
        owner_id=ctx.owner_id,
        type_=body.type,
        parent_group_id=body.parent_group_id,
        ids=body.items,
    )
    return {"ok": True}


@router.get(
    "/groups/{group_id}",
    response_model=CoaGroupResponse,
)
async def get_group(
    business_id: str,
    group_id: str,
    ctx: BusinessContext = Depends(_COA_VIEW),
    db: AsyncSession = Depends(get_db),
) -> CoaGroupResponse:
    """Get a single COA group by ID."""
    return await CoaService(db).get_group(business_id, group_id, ctx.owner_id)


@router.put(
    "/groups/{group_id}",
    response_model=CoaGroupResponse,
)
async def update_group(
    business_id: str,
    group_id: str,
    body: CoaGroupUpdate,
    ctx: BusinessContext = Depends(_COA_EDIT),
    db: AsyncSession = Depends(get_db),
) -> CoaGroupResponse:
    """Update a COA group's name or parent."""
    return await CoaService(db).update_group(
        business_id=business_id,
        group_id=group_id,
        owner_id=ctx.owner_id,
        name=body.name,
        parent_group_id=body.parent_group_id,
    )


@router.delete(
    "/groups/{group_id}",
)
async def delete_group(
    business_id: str,
    group_id: str,
    ctx: BusinessContext = Depends(_COA_DELETE),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a COA group by ID."""
    await CoaService(db).delete_group(business_id, group_id, ctx.owner_id)
    return {"ok": True}


# ------------------------------------------------------------------ Accounts


@router.get(
    "/accounts",
    response_model=CoaAccountListResponse,
)
async def list_accounts(
    business_id: str,
    ctx: BusinessContext = Depends(_COA_VIEW),
    db: AsyncSession = Depends(get_db),
) -> CoaAccountListResponse:
    """List all COA accounts for a business owned by the requesting user."""
    return await CoaService(db).list_accounts(business_id, ctx.owner_id)


@router.post(
    "/accounts",
    response_model=CoaAccountResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_account(
    business_id: str,
    body: CoaAccountCreate,
    ctx: BusinessContext = Depends(_COA_CREATE),
    db: AsyncSession = Depends(get_db),
) -> CoaAccountResponse:
    """Create a new COA account under the given business."""
    return await CoaService(db).create_account(
        business_id=business_id,
        owner_id=ctx.owner_id,
        name=body.name,
        code=body.code,
        group_id=body.group_id,
        cash_flow_category=body.cash_flow_category,
        type_=body.type,
        description=body.description,
        is_active=body.is_active,
    )


@router.put(
    "/accounts/order",
)
async def reorder_accounts(
    business_id: str,
    body: CoaAccountsOrderUpdate,
    ctx: BusinessContext = Depends(_COA_EDIT),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Reorder COA accounts within a group."""
    await CoaService(db).reorder_accounts(
        business_id=business_id,
        owner_id=ctx.owner_id,
        group_id=body.group_id,
        ids=body.items,
    )
    return {"ok": True}


@router.get(
    "/accounts/{account_id}",
    response_model=CoaAccountResponse,
)
async def get_account(
    business_id: str,
    account_id: str,
    ctx: BusinessContext = Depends(_COA_VIEW),
    db: AsyncSession = Depends(get_db),
) -> CoaAccountResponse:
    """Get a single COA account by ID."""
    return await CoaService(db).get_account(
        business_id, account_id, ctx.owner_id
    )


@router.put(
    "/accounts/{account_id}",
    response_model=CoaAccountResponse,
)
async def update_account(
    business_id: str,
    account_id: str,
    body: CoaAccountUpdate,
    ctx: BusinessContext = Depends(_COA_EDIT),
    db: AsyncSession = Depends(get_db),
) -> CoaAccountResponse:
    """Update a COA account's name, group, or cash flow category."""
    return await CoaService(db).update_account(
        business_id=business_id,
        account_id=account_id,
        owner_id=ctx.owner_id,
        name=body.name,
        code=body.code,
        update_code="code" in body.model_fields_set,
        group_id=body.group_id,
        update_group_id="group_id" in body.model_fields_set,
        cash_flow_category=body.cash_flow_category,
        update_cash_flow="cash_flow_category" in body.model_fields_set,
        type_=body.type,
        description=body.description,
        is_active=body.is_active,
    )


@router.delete(
    "/accounts/{account_id}",
)
async def delete_account(
    business_id: str,
    account_id: str,
    ctx: BusinessContext = Depends(_COA_DELETE),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a COA account by ID."""
    await CoaService(db).delete_account(
        business_id, account_id, ctx.owner_id
    )
    return {"ok": True}
