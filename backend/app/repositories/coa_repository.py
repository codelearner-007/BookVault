"""COA repository — data access layer for coa_groups and coa_accounts tables."""

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.coa_account import CoaAccount
from app.models.coa_group import CoaGroup
from app.repositories.base_repository import BaseRepository


class CoaRepository(BaseRepository[CoaGroup]):
    """Repository for Chart of Accounts group and account operations."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(CoaGroup, session)

    # ------------------------------------------------------------------ Groups

    async def list_groups(self, business_id: str) -> list[CoaGroup]:
        """Return all COA groups for the given business, ordered by sort_order then id."""
        result = await self.session.execute(
            select(CoaGroup)
            .where(CoaGroup.business_id == business_id)
            .order_by(CoaGroup.sort_order.asc(), CoaGroup.id.asc())
        )
        return list(result.scalars().all())

    async def get_group(self, business_id: str, group_id: str) -> CoaGroup | None:
        """Return a single COA group matching both business_id and group_id."""
        result = await self.session.execute(
            select(CoaGroup).where(
                CoaGroup.business_id == business_id,
                CoaGroup.id == group_id,
            )
        )
        return result.scalar_one_or_none()

    async def create_group(
        self,
        business_id: str,
        name: str,
        type_: str,
        parent_group_id: str | None,
        is_system: bool = False,
        sort_order: int = 0,
    ) -> CoaGroup:
        """Insert a new COA group and return the persisted instance."""
        group = CoaGroup(
            business_id=business_id,
            name=name,
            type=type_,
            parent_group_id=parent_group_id,
            is_system=is_system,
            sort_order=sort_order,
        )
        self.session.add(group)
        await self.session.flush()
        await self.session.refresh(group)
        return group

    async def update_group(
        self,
        business_id: str,
        group_id: str,
        name: str | None,
        parent_group_id: str | None,
    ) -> CoaGroup | None:
        """Update mutable fields on a COA group. Returns None if not found."""
        group = await self.get_group(business_id, group_id)
        if group is None:
            return None
        if name is not None:
            group.name = name
        if parent_group_id is not None and parent_group_id != group.parent_group_id:
            group.parent_group_id = parent_group_id
        await self.session.flush()
        await self.session.refresh(group)
        return group

    async def delete_group(self, business_id: str, group_id: str) -> bool:
        """Delete a COA group. Returns True if deleted, False if not found."""
        group = await self.get_group(business_id, group_id)
        if group is None:
            return False
        await self.session.delete(group)
        await self.session.flush()
        return True

    async def reorder_groups(
        self,
        business_id: str,
        type_: str,
        parent_group_id: str | None,
        ids: list[str],
    ) -> bool:
        """Assign sort_order for each group id based on its position in ids list."""
        for idx, group_id in enumerate(ids):
            await self.session.execute(
                update(CoaGroup)
                .where(
                    CoaGroup.id == group_id,
                    CoaGroup.business_id == business_id,
                    CoaGroup.type == type_,
                    CoaGroup.parent_group_id == parent_group_id
                    if parent_group_id is not None
                    else CoaGroup.parent_group_id.is_(None),
                )
                .values(sort_order=idx)
            )
        await self.session.flush()
        return True

    # ---------------------------------------------------------------- Accounts

    async def list_accounts(self, business_id: str) -> list[CoaAccount]:
        """Return all COA accounts for the given business, ordered by sort_order then id."""
        result = await self.session.execute(
            select(CoaAccount)
            .where(CoaAccount.business_id == business_id)
            .order_by(CoaAccount.sort_order.asc(), CoaAccount.id.asc())
        )
        return list(result.scalars().all())

    async def get_account(self, business_id: str, account_id: str) -> CoaAccount | None:
        """Return a single COA account matching both business_id and account_id."""
        result = await self.session.execute(
            select(CoaAccount).where(
                CoaAccount.business_id == business_id,
                CoaAccount.id == account_id,
            )
        )
        return result.scalar_one_or_none()

    async def existing_account_ids(self, business_id: str, account_ids: set[str]) -> set[str]:
        """Return the subset of account_ids that are COA accounts of the given business."""
        result = await self.session.execute(
            select(CoaAccount.id).where(
                CoaAccount.business_id == business_id,
                CoaAccount.id.in_(account_ids),
            )
        )
        return {str(account_id) for account_id in result.scalars().all()}

    async def get_group_by_name(self, business_id: str, name: str) -> CoaGroup | None:
        """Return the first COA group matching name for this business, or None."""
        result = await self.session.execute(
            select(CoaGroup)
            .where(CoaGroup.business_id == business_id, CoaGroup.name == name)
            .limit(1)
        )
        return result.scalars().first()

    async def get_account_by_name(self, business_id: str, name: str) -> CoaAccount | None:
        """Return the first COA account matching name for this business, or None."""
        result = await self.session.execute(
            select(CoaAccount)
            .where(CoaAccount.business_id == business_id, CoaAccount.name == name)
            .limit(1)
        )
        return result.scalars().first()

    async def create_account(
        self,
        business_id: str,
        name: str,
        code: str | None = None,
        group_id: str | None = None,
        cash_flow_category: str | None = None,
        type_: str = "income",
        is_system: bool = False,
        sort_order: int = 0,
        description: str | None = None,
        is_active: bool = True,
    ) -> CoaAccount:
        """Insert a new COA account and return the persisted instance."""
        account = CoaAccount(
            business_id=business_id,
            name=name,
            code=code,
            group_id=group_id,
            cash_flow_category=cash_flow_category,
            type=type_,
            is_system=is_system,
            sort_order=sort_order,
            description=description,
            is_active=is_active,
        )
        self.session.add(account)
        await self.session.flush()
        await self.session.refresh(account)
        return account

    async def update_account(
        self,
        business_id: str,
        account_id: str,
        name: str | None,
        group_id: str | None,
        update_group_id: bool,
        cash_flow_category: str | None,
        update_cash_flow: bool,
        code: str | None,
        update_code: bool,
        type_: str | None,
        is_system: bool | None = None,
        description: str | None = None,
        is_active: bool | None = None,
    ) -> CoaAccount | None:
        """Update mutable fields on a COA account. Returns None if not found."""
        account = await self.get_account(business_id, account_id)
        if account is None:
            return None
        if name is not None:
            account.name = name
        if update_group_id:
            account.group_id = group_id
        if update_cash_flow:
            account.cash_flow_category = cash_flow_category
        if update_code:
            account.code = code
        if type_ is not None:
            account.type = type_
        if is_system is not None:
            account.is_system = is_system
        if description is not None:
            account.description = description
        if is_active is not None:
            account.is_active = is_active
        await self.session.flush()
        await self.session.refresh(account)
        return account

    async def delete_account(self, business_id: str, account_id: str) -> bool:
        """Delete a COA account. Returns True if deleted, False if not found."""
        account = await self.get_account(business_id, account_id)
        if account is None:
            return False
        await self.session.delete(account)
        await self.session.flush()
        return True

    async def reorder_accounts(
        self,
        business_id: str,
        group_id: str | None,
        ids: list[str],
    ) -> bool:
        """Assign sort_order for each account id based on its position in ids list."""
        for idx, account_id in enumerate(ids):
            await self.session.execute(
                update(CoaAccount)
                .where(
                    CoaAccount.id == account_id,
                    CoaAccount.business_id == business_id,
                    CoaAccount.group_id == group_id
                    if group_id is not None
                    else CoaAccount.group_id.is_(None),
                )
                .values(sort_order=idx)
            )
        await self.session.flush()
        return True

    async def seed_default_coa(self, business_id: str) -> None:
        """Seed the default system COA structure for a newly created business.

        Balance Sheet:
          - Assets (group, is_system, sort 0)
          - Liabilities (group, is_system, sort 1)
          - Equity (group, is_system, sort 2)
              └── Retained Earnings (account under Equity, is_system, sort 0)

        Profit & Loss:
          - Net Profit (Loss) (account, is_system, type=total, no group, sort 0)
        """
        # Balance Sheet system groups
        assets = await self.create_group(
            business_id, "Assets", "balance_sheet", None, is_system=True, sort_order=0
        )
        await self.create_group(
            business_id, "Liabilities", "balance_sheet", None, is_system=True, sort_order=1
        )
        equity = await self.create_group(
            business_id, "Equity", "balance_sheet", None, is_system=True, sort_order=2
        )

        # Retained Earnings under Equity (system account)
        await self.create_account(
            business_id=business_id,
            name="Retained Earnings",
            group_id=equity.id,
            cash_flow_category=None,
            type_="equity",
            is_system=True,
            sort_order=0,
        )

        # Suppress unused variable warning — assets group is seeded but has no default accounts
        _ = assets

        # Net Profit (Loss) — system P&L total account (ungrouped)
        await self.create_account(
            business_id=business_id,
            name="Net Profit (Loss)",
            group_id=None,
            cash_flow_category=None,
            type_="total",
            is_system=True,
            sort_order=0,
        )
