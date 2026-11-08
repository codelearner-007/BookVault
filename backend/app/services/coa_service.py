"""COA service: the chart tree, groups and accounts (versioned, audited; B2 structure rules).

Five fixed roots (Assets, Liabilities, Equity, Income, Expenses) hold every group and account;
an account's type is the type of its root. Roots and system accounts can be renamed but never
deleted; an account with ledger, draft or receipt lines cannot be deleted (409). The database
backs the structure up (triggers coa_groups_check_tree, coa_accounts_check_root).
"""

from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ConflictError,
    ImmutableResourceError,
    LedgerValidationError,
    ResourceNotFoundError,
    ValidationError,
)
from app.core.money import round_money
from app.core.pagination import PageParams
from app.models.coa_account import CoaAccount
from app.models.coa_group import CoaGroup
from app.repositories.coa_repository import CoaRepository
from app.repositories.opening_balance_repository import OpeningBalanceRepository
from app.schemas.common import PaginatedResponse
from app.schemas.request.coa import (
    CoaAccountCreate,
    CoaAccountsOrderUpdate,
    CoaAccountUpdate,
    CoaGroupCreate,
    CoaGroupsOrderUpdate,
    CoaGroupUpdate,
)
from app.schemas.response.coa import (
    CoaAccountResponse,
    CoaGroupResponse,
    CoaTreeAccount,
    CoaTreeGroup,
    CoaTreeResponse,
    OpeningBalanceOut,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.coa_tree import TreeNode, build_tree, descendants, root_key_of, signed
from app.services.opening_balance_rules import can_have_opening_balance, opening_side
from app.services.posting import PostingService
from app.services.versioning import changed_fields, check_version

GROUP = "CoaGroup"
ACCOUNT = "CoaAccount"
SYSTEM_MANAGED = "system-managed"
DEFAULT_ACCOUNT_TYPE = "income"
# What a root group / system account accepts in an update.
ROOT_GROUP_FIELDS = {"name"}
SYSTEM_ACCOUNT_FIELDS = {"name", "code", "description", "group_id", "cash_flow_category"}


def _invalid(message: str, code: str) -> LedgerValidationError:
    return LedgerValidationError(message, code)


class CoaService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = CoaRepository(session)
        self.openings = OpeningBalanceRepository(session)
        self.posting = PostingService(session)
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

    async def _target_group(self, business_id: str, group_id: str, field: str) -> CoaGroup:
        """A group reference of this business (CS-05)."""
        group = await self.repo.get_group(business_id, group_id)
        if group is None:
            raise ValidationError("Referenced group not found in this business", field)
        return group

    # ------------------------------------------------------------------ Tree

    async def tree(self, business_id: str, as_at: date, include_hidden: bool = False) -> CoaTreeResponse:
        roots = await self.repo.roots()
        groups = await self.repo.all_groups(business_id)
        accounts = [a for a in await self.repo.chart_accounts(business_id, as_at) if include_hidden or a.is_visible]
        openings = await self.openings.live_account_openings(business_id)
        dp = await self.posting.decimals(business_id)
        nodes = build_tree(roots, groups, accounts, lambda a, r: round_money(signed(a.net, r.normal_balance), dp))

        def account_out(row, amount, root_key: str) -> CoaTreeAccount:
            opening = openings.get(row.id)
            return CoaTreeAccount(
                **{k: getattr(row, k) for k in (
                    "id", "name", "code", "group_id", "type", "cash_flow_category", "description",
                    "is_active", "sort_order", "version", "system_account_code", "is_used")},
                is_system=row.system_account_code is not None,
                balance=amount,
                can_have_opening_balance=can_have_opening_balance(
                    root_key, row.system_account_code, row.subledger_kind),
                opening_balance=OpeningBalanceOut(**opening_side(opening.debit, opening.credit, dp))
                if opening else None,
            )

        def group_out(node: TreeNode) -> CoaTreeGroup:
            g = node.group
            return CoaTreeGroup(
                id=g.id, name=g.name, root_key=g.root_key, statement_type=g.type,
                parent_group_id=g.parent_group_id, is_system=g.is_system, sort_order=g.sort_order,
                version=g.version, balance=node.total, groups=[group_out(c) for c in node.groups],
                accounts=[account_out(a, amt, node.root.key) for a, amt in node.accounts],
            )

        start = await self.posting.books_start_date(business_id)
        return CoaTreeResponse(
            as_at=as_at, opening_date=start - timedelta(days=1),
            roots=[group_out(n) for n in nodes],
        )

    # ------------------------------------------------------------------ Groups

    async def list_groups(self, business_id: str, params: PageParams) -> PaginatedResponse[CoaGroupResponse]:
        rows, total = await self.repo.list_groups_page(business_id, params.offset, params.page_size)
        items = [CoaGroupResponse.model_validate(g) for g in rows]
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def get_group(self, business_id: str, group_id: str) -> CoaGroupResponse:
        return CoaGroupResponse.model_validate(await self._group(business_id, group_id))

    async def create_group(self, ctx: BusinessContext, body: CoaGroupCreate) -> CoaGroupResponse:
        parent = await self._target_group(ctx.business_id, body.parent_group_id, "parent_group_id")
        if parent.type != body.type:
            raise _invalid("A group must be on the same statement as its parent", "group_panel_mismatch")
        group = CoaGroup(business_id=ctx.business_id, name=body.name, type=body.type, parent_group_id=parent.id)
        await self.repo.add(group)
        after = CoaGroupResponse.model_validate(group)
        await self.audit.record(ctx.user_id, "create", GROUP, group.id, ctx.business_id, after=after)
        return after

    async def _check_group_move(self, business_id: str, group: CoaGroup, parent_id: str) -> None:
        parent = await self._target_group(business_id, parent_id, "parent_group_id")
        groups = await self.repo.all_groups(business_id)
        if parent.id == group.id or parent.id in descendants(groups, group.id):
            raise _invalid("A group cannot be moved inside itself", "group_cycle")
        if parent.type != group.type:
            raise _invalid("A group must be on the same statement as its parent", "group_panel_mismatch")
        if root_key_of(groups, parent.id) != root_key_of(groups, group.id):
            raise _invalid("A group stays under its root (its accounts' type depends on it)",
                           "account_type_mismatch")

    async def update_group(self, ctx: BusinessContext, group_id: str, body: CoaGroupUpdate) -> CoaGroupResponse:
        group = await self._group(ctx.business_id, group_id)
        check_version(group, body.version)
        fields = {k: v for k, v in changed_fields(body, required=("name",)).items()
                  if v is not None and v != getattr(group, k)}
        if group.is_system and set(fields) - ROOT_GROUP_FIELDS:
            raise ImmutableResourceError(GROUP, group_id, SYSTEM_MANAGED)
        before = CoaGroupResponse.model_validate(group)
        if "parent_group_id" in fields:
            await self._check_group_move(ctx.business_id, group, fields["parent_group_id"])
        for key, value in fields.items():
            setattr(group, key, value)
        await self.repo.save(group)
        after = CoaGroupResponse.model_validate(group)
        await self.audit.record(ctx.user_id, "update", GROUP, group_id, ctx.business_id,
                                before=before, after=after)
        return after

    async def delete_group(self, ctx: BusinessContext, group_id: str, version: int, move_to: str | None) -> None:
        """Its sub-groups and accounts move to `move_to` (default: the parent), never to "Uncategorized"."""
        group = await self._group(ctx.business_id, group_id)
        if group.is_system:
            raise ImmutableResourceError(GROUP, group_id, SYSTEM_MANAGED)
        check_version(group, version)
        target = move_to or group.parent_group_id
        groups = await self.repo.all_groups(ctx.business_id)
        if target == group.id or target in descendants(groups, group.id):
            raise _invalid("Move the contents to a group outside the one being deleted", "group_cycle")
        await self._target_group(ctx.business_id, target, "move_to")
        if root_key_of(groups, target) != root_key_of(groups, group.id):
            raise _invalid("Move the contents to a group under the same root", "account_type_mismatch")
        before = CoaGroupResponse.model_validate(group)
        await self.repo.move_children(ctx.business_id, group.id, target)
        await self.repo.delete(group)
        await self.audit.record(ctx.user_id, "delete", GROUP, group_id, ctx.business_id, before=before,
                                details={"moved_to": target})

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

    async def _placement(self, business_id: str, group_id: str | None, type_: str | None) -> tuple[str, str]:
        """(group_id, type): no group -> the root of the type; no type -> the group's root type."""
        roots = await self.repo.roots()
        groups = await self.repo.all_groups(business_id)
        if group_id is None:
            type_ = type_ or DEFAULT_ACCOUNT_TYPE
            root_key = next(r.key for r in roots if r.account_type == type_)
            return next(g.id for g in groups if g.root_key == root_key), type_
        await self._target_group(business_id, group_id, "group_id")
        root_type = next(r.account_type for r in roots if r.key == root_key_of(groups, group_id))
        if type_ is not None and type_ != root_type:
            raise _invalid("The account type must match the root of its group", "account_type_mismatch")
        return group_id, root_type

    async def create_account(self, ctx: BusinessContext, body: CoaAccountCreate) -> CoaAccountResponse:
        group_id, type_ = await self._placement(ctx.business_id, body.group_id, body.type)
        account = CoaAccount(
            business_id=ctx.business_id, name=body.name, code=body.code, group_id=group_id,
            cash_flow_category=body.cash_flow_category, type=type_, description=body.description,
            is_active=body.is_active,
        )
        await self.repo.add(account)
        after = CoaAccountResponse.model_validate(account)
        await self.audit.record(ctx.user_id, "create", ACCOUNT, account.id, ctx.business_id, after=after)
        return after

    async def update_account(
        self, ctx: BusinessContext, account_id: str, body: CoaAccountUpdate
    ) -> CoaAccountResponse:
        account = await self._account(ctx.business_id, account_id)
        check_version(account, body.version)
        fields = {k: v for k, v in changed_fields(body, required=("name", "type", "is_active", "group_id")).items()
                  if v != getattr(account, k)}
        if account.is_system and set(fields) - SYSTEM_ACCOUNT_FIELDS:
            raise ImmutableResourceError(ACCOUNT, account_id, SYSTEM_MANAGED)
        before = CoaAccountResponse.model_validate(account)
        if "group_id" in fields or "type" in fields:
            group_id, type_ = await self._placement(
                ctx.business_id, fields.get("group_id", account.group_id), fields.get("type", account.type))
            fields["type"] = type_
            if account.is_system and type_ != account.type:
                raise _invalid("A system account stays under its root", "account_type_mismatch")
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
        if await self.repo.is_used(ctx.business_id, account_id):
            raise ConflictError(
                "This account has transactions and cannot be deleted; mark it inactive instead",
                "account_in_use",
            )
        before = CoaAccountResponse.model_validate(account)
        await self.repo.delete(account)
        await self.audit.record(ctx.user_id, "delete", ACCOUNT, account_id, ctx.business_id,
                                before=before)

    async def reorder_accounts(self, ctx: BusinessContext, body: CoaAccountsOrderUpdate) -> None:
        await self.repo.reorder_accounts(ctx.business_id, body.group_id, body.items)
        await self.audit.record(ctx.user_id, "reorder", ACCOUNT, None, ctx.business_id,
                                after=body.model_dump(mode="json"))
