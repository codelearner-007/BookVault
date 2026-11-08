"""COA request schemas (strict; server-managed fields such as is_system are not accepted)."""

from typing import Literal, Optional

from pydantic import Field

from app.schemas.common import (
    LIST_MAX,
    NAME_MAX,
    IdStr,
    OptionalCode,
    OptionalText,
    RequestModel,
    ShortText,
    VersionedRequest,
)

GroupPanelType = Literal["balance_sheet", "pl"]
AccountType = Literal["asset", "liability", "equity", "income", "expense", "total"]
CashFlow = Literal["operating", "investing", "financing", "cash_equivalent"]


class CoaGroupCreate(RequestModel):
    name: ShortText
    type: GroupPanelType
    parent_group_id: Optional[IdStr] = None


class CoaGroupUpdate(VersionedRequest):
    """Rename and/or move; a missing or null parent_group_id leaves the parent unchanged."""

    name: Optional[str] = Field(None, min_length=1, max_length=NAME_MAX)
    parent_group_id: Optional[IdStr] = None


class CoaAccountCreate(RequestModel):
    name: ShortText
    code: OptionalCode = None
    group_id: Optional[IdStr] = None
    cash_flow_category: Optional[CashFlow] = None
    type: AccountType = "income"
    description: OptionalText = None
    is_active: bool = True


class CoaAccountUpdate(VersionedRequest):
    """Partial update; only the fields sent are changed (code/group/cash flow/description may be cleared)."""

    name: Optional[str] = Field(None, min_length=1, max_length=NAME_MAX)
    code: OptionalCode = None
    group_id: Optional[IdStr] = None
    cash_flow_category: Optional[CashFlow] = None
    type: Optional[AccountType] = None
    description: OptionalText = None
    is_active: Optional[bool] = None


class CoaGroupsOrderUpdate(RequestModel):
    type: GroupPanelType
    parent_group_id: Optional[IdStr] = None
    items: list[IdStr] = Field(max_length=LIST_MAX)


class CoaAccountsOrderUpdate(RequestModel):
    group_id: Optional[IdStr] = None
    items: list[IdStr] = Field(max_length=LIST_MAX)
