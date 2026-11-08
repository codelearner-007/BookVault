"""COA service: groups and accounts of the Chart of Accounts (versioned, audited)."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ImmutableResourceError, ResourceNotFoundError, ValidationError
from app.core.pagination import PageParams
from app.models.coa_account import CoaAccount
from app.models.coa_group import CoaGroup
from app.repositories.coa_repository import CoaRepository
from app.schemas.common import PaginatedResponse
from app.schemas.request.coa import (
    CoaAccountCreate,
    CoaAccountsOrderUpdate,
    CoaAccountUpdate,
    CoaGroupCreate,
    CoaGroupsOrderUpdate,
    CoaGroupUpdate,
)
from app.schemas.response.coa import CoaAccountResponse, CoaGroupResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.versioning import changed_fields, check_version

GROUP = "CoaGroup"
ACCOUNT = "CoaAccount"
SYSTEM_MANAGED = "system-managed"


class CoaService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = CoaRepository(session)
        self.audit = AuditService(session)

    async def _group(self, business_id: str, group_id: str) -> CoaGroup:
        group = await self.repo.get_group(business_id, group_id)
        if group is None:
            raise ResourceNotFoundError(GROUP, group_id)
        return group

    async def _account(self, business_id: str, account_id: str) -> CoaAccount:
        account = await self.repo.get_account(business_id, account_id)
        if account is None:
            raise ResourceNotFoundError(ACCOUNT, account_id)
        return account

    async def _require_group_in_business(self, business_id: str, group_id: str | None, field: str) -> None:
        """Reject a group reference that is not a group of this business (CS-05)."""
        if group_id is not None and not await self.repo.get_group(business_id, group_id):
            raise ValidationError("Referenced group not found in this business", field)

    # ------------------------------------------------------------------ Groups

    async def list_groups(self, business_id: str, params: PageParams) -> PaginatedResponse[CoaGroupResponse]:
        rows, total = await self.repo.list_groups_page(business_id, params.offset, params.page_size)
        items = [CoaGroupResponse.model_validate(g) for g in rows]
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def get_group(self, business_id: str, group_id: str) -> CoaGroupResponse:
        return CoaGroupResponse.model_validate(await self._group(business_id, group_id))

    async def create_group(self, ctx: BusinessContext, body: CoaGroupCreate) -> CoaGroupResponse:
        await self._require_group_in_business(ctx.business_id, body.parent_group_id, "parent_group_id")
        group = await self.repo.create_group(
            ctx.business_id, body.name, body.type, body.parent_group_id, is_system=False
        )
        after = CoaGroupResponse.model_validate(group)
        await self.audit.record(ctx.user_id, "create", GROUP, group.id, ctx.business_id, after=after)
        return after

    async def update_group(self, ctx: BusinessContext, group_id: str, body: CoaGroupUpdate) -> CoaGroupResponse:
        group = await self._group(ctx.business_id, group_id)
        if group.is_system:
            raise ImmutableResourceError(GROUP, group_id, SYSTEM_MANAGED)
        check_version(group, body.version)
        before = CoaGroupResponse.model_validate(group)
        fields = {k: v for k, v in changed_fields(body, required=("name",)).items() if v is not None}
        parent_id = fields.get("parent_group_id")
        if parent_id == group_id:
            raise ValidationError("A group cannot be its own parent", "parent_group_id")
        await self._require_group_in_business(ctx.business_id, parent_id, "parent_group_id")
        for key, value in fields.items():
            setattr(group, key, value)
        await self.repo.save(group)
        after = CoaGroupResponse.model_validate(group)
        await self.audit.record(ctx.user_id, "update", GROUP, group_id, ctx.business_id,
                                before=before, after=after)
        return after

    async def delete_group(self, ctx: BusinessContext, group_id: str, version: int) -> None:
        group = await self._group(ctx.business_id, group_id)
        if group.is_system:
            raise ImmutableResourceError(GROUP, group_id, SYSTEM_MANAGED)
        check_version(group, version)
        before = CoaGroupResponse.model_validate(group)
        await self.repo.delete(group)
        await self.audit.record(ctx.user_id, "delete", GROUP, group_id, ctx.business_id, before=before)

    async def reorder_groups(self, ctx: BusinessContext, body: CoaGroupsOrderUpdate) -> None:
        await self.repo.reorder_groups(ctx.business_id, body.type, body.parent_group_id, body.items)
        await self.audit.record(ctx.user_id, "reorder", GROUP, None, ctx.business_id,
                                after=body.model_dump(mode="json"))

    # ---------------------------------------------------------------- Accounts

    async def list_accounts(
        self, business_id: str, params: PageParams
    ) -> PaginatedResponse[CoaAccountResponse]:
        rows, total = await self.repo.list_accounts_page(business_id, params.offset, params.page_size)
        items = [CoaAccountResponse.model_validate(a) for a in rows]
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def get_account(self, business_id: str, account_id: str) -> CoaAccountResponse:
        return CoaAccountResponse.model_validate(await self._account(business_id, account_id))

    async def create_account(self, ctx: BusinessContext, body: CoaAccountCreate) -> CoaAccountResponse:
        await self._require_group_in_business(ctx.business_id, body.group_id, "group_id")
        account = await self.repo.create_account(
            business_id=ctx.business_id,
            name=body.name,
            code=body.code,
            group_id=body.group_id,
            cash_flow_category=body.cash_flow_category,
            type_=body.type,
            is_system=False,
            description=body.description,
            is_active=body.is_active,
        )
        after = CoaAccountResponse.model_validate(account)
        await self.audit.record(ctx.user_id, "create", ACCOUNT, account.id, ctx.business_id, after=after)
        return after

    async def update_account(
        self, ctx: BusinessContext, account_id: str, body: CoaAccountUpdate
    ) -> CoaAccountResponse:
        account = await self._account(ctx.business_id, account_id)
        if account.is_system:
            raise ImmutableResourceError(ACCOUNT, account_id, SYSTEM_MANAGED)
        check_version(account, body.version)
        before = CoaAccountResponse.model_validate(account)
        fields = changed_fields(body, required=("name", "type", "is_active"))
        if "group_id" in fields:
            await self._require_group_in_business(ctx.business_id, fields["group_id"], "group_id")
        for key, value in fields.items():
            setattr(account, key, value)
        await self.repo.save(account)
        after = CoaAccountResponse.model_validate(account)
        await self.audit.record(ctx.user_id, "update", ACCOUNT, account_id, ctx.business_id,
                                before=before, after=after)
        return after

    async def delete_account(self, ctx: BusinessContext, account_id: str, version: int) -> None:
        account = await self._account(ctx.business_id, account_id)
        if account.is_system:
            raise ImmutableResourceError(ACCOUNT, account_id, SYSTEM_MANAGED)
        check_version(account, version)
        before = CoaAccountResponse.model_validate(account)
        await self.repo.delete(account)
        await self.audit.record(ctx.user_id, "delete", ACCOUNT, account_id, ctx.business_id,
                                before=before)

    async def reorder_accounts(self, ctx: BusinessContext, body: CoaAccountsOrderUpdate) -> None:
        await self.repo.reorder_accounts(ctx.business_id, body.group_id, body.items)
        await self.audit.record(ctx.user_id, "reorder", ACCOUNT, None, ctx.business_id,
                                after=body.model_dump(mode="json"))
