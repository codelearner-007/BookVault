"""COA repository — data access layer for coa_groups and coa_accounts tables."""

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.coa_account import CoaAccount
from app.models.coa_group import CoaGroup

# One statement per reorder (CS-13): position = ordinal in the submitted id list.
_REORDER_GROUPS = text("""
    UPDATE coa_groups AS g SET sort_order = o.idx - 1
    FROM unnest(CAST(:ids AS uuid[])) WITH ORDINALITY AS o(id, idx)
    WHERE g.id = o.id AND g.business_id = CAST(:business_id AS uuid) AND g.type = :type
      AND g.parent_group_id IS NOT DISTINCT FROM CAST(:parent_id AS uuid)
""")
_REORDER_ACCOUNTS = text("""
    UPDATE coa_accounts AS a SET sort_order = o.idx - 1
    FROM unnest(CAST(:ids AS uuid[])) WITH ORDINALITY AS o(id, idx)
    WHERE a.id = o.id AND a.business_id = CAST(:business_id AS uuid)
      AND a.group_id IS NOT DISTINCT FROM CAST(:group_id AS uuid)
""")


class CoaRepository:
    """Repository for Chart of Accounts group and account operations."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _page(self, model, business_id: str, offset: int, limit: int) -> tuple[list, int]:
        total = (
            await self.session.execute(
                select(func.count()).select_from(model).where(model.business_id == business_id)
            )
        ).scalar_one()
        result = await self.session.execute(
            select(model)
            .where(model.business_id == business_id)
            .order_by(model.sort_order.asc(), model.id.asc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all()), total

    async def list_groups_page(self, business_id: str, offset: int, limit: int) -> tuple[list[CoaGroup], int]:
        return await self._page(CoaGroup, business_id, offset, limit)

    async def list_accounts_page(
        self, business_id: str, offset: int, limit: int
    ) -> tuple[list[CoaAccount], int]:
        return await self._page(CoaAccount, business_id, offset, limit)

    async def save(self, row: CoaGroup | CoaAccount) -> None:
        await self.session.flush()
        await self.session.refresh(row)

    async def delete(self, row: CoaGroup | CoaAccount) -> None:
        await self.session.delete(row)
        await self.session.flush()

    # ------------------------------------------------------------------ Groups

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

    # ---------------------------------------------------------------- Accounts

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
        await self.create_group(
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

    async def reorder_groups(
        self, business_id: str, type_: str, parent_group_id: str | None, ids: list[str]
    ) -> None:
        await self.session.execute(_REORDER_GROUPS, {
            "ids": ids, "business_id": business_id, "type": type_, "parent_id": parent_group_id,
        })

    async def reorder_accounts(self, business_id: str, group_id: str | None, ids: list[str]) -> None:
        await self.session.execute(_REORDER_ACCOUNTS, {
            "ids": ids, "business_id": business_id, "group_id": group_id,
        })
