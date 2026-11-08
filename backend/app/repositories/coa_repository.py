"""COA repository: coa_groups, coa_accounts and the read queries of the chart (B2)."""

from datetime import date

from sqlalchemy import func, select, text, update
from sqlalchemy.engine import Row
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
      AND a.group_id = CAST(:group_id AS uuid)
""")
_ROOTS = text("SELECT key, name, statement_type, account_type, normal_balance, sort_order "
              "FROM public.coa_root_groups ORDER BY sort_order")
# A used account: journal or draft lines, or a receipt line (receipts keep lines in JSON until B3).
_USED = """
    EXISTS (SELECT 1 FROM public.journal_lines l WHERE l.business_id = a.business_id AND l.account_id = a.id)
    OR EXISTS (SELECT 1 FROM public.document_lines l WHERE l.business_id = a.business_id AND l.account_id = a.id)
    OR EXISTS (SELECT 1 FROM public.receipts r, jsonb_array_elements(r.lines) x
               WHERE r.business_id = a.business_id AND x->>'account_id' = CAST(a.id AS text))
"""
_IS_USED = text(f"SELECT {_USED} FROM public.coa_accounts a WHERE a.business_id = :business_id AND a.id = :id")
# Every account with its balance as at :as_at, the system type and whether it is shown:
# a system account is hidden until its tab is enabled or it has a balance (posting-rules §2).
_CHART_ACCOUNTS = text(f"""
    SELECT CAST(a.id AS text) AS id, a.name, a.code, CAST(a.group_id AS text) AS group_id, a.type,
           a.cash_flow_category, a.description, a.is_active, a.sort_order, a.version,
           s.code AS system_account_code, s.subledger_kind,
           COALESCE(b.net, 0) AS net, ({_USED}) AS is_used,
           (s.id IS NULL OR s.always_visible OR COALESCE(b.net, 0) <> 0
            OR COALESCE(bt.enabled, t.default_enabled, false)) AS is_visible
    FROM public.coa_accounts a
    LEFT JOIN public.system_account_types s ON s.id = a.system_account_type_id
    LEFT JOIN public.admin_tabs t ON t.id = s.enabled_by_admin_tab_id
    LEFT JOIN public.business_tabs bt ON bt.business_id = a.business_id AND bt.key = t.key
    LEFT JOIN (
        SELECT l.account_id, sum(l.debit) - sum(l.credit) AS net
        FROM public.journal_lines l
        JOIN public.journal_entries e ON e.business_id = l.business_id AND e.id = l.journal_entry_id
        WHERE l.business_id = :business_id AND COALESCE(l.line_date, e.entry_date) <= :as_at
        GROUP BY l.account_id
    ) b ON b.account_id = a.id
    WHERE a.business_id = :business_id
    ORDER BY a.sort_order, a.code NULLS LAST, a.name
""")


class CoaRepository:
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

    async def all_groups(self, business_id: str) -> list[CoaGroup]:
        result = await self.session.execute(
            select(CoaGroup).where(CoaGroup.business_id == business_id)
            .order_by(CoaGroup.sort_order, CoaGroup.name)
        )
        return list(result.scalars().all())

    async def roots(self) -> list[Row]:
        return list((await self.session.execute(_ROOTS)).all())

    async def chart_accounts(self, business_id: str, as_at: date) -> list[Row]:
        return list((await self.session.execute(_CHART_ACCOUNTS, {"business_id": business_id, "as_at": as_at})).all())

    async def save(self, row: CoaGroup | CoaAccount) -> None:
        await self.session.flush()
        await self.session.refresh(row)

    async def add(self, row: CoaGroup | CoaAccount) -> None:
        self.session.add(row)
        await self.session.flush()
        await self.session.refresh(row)

    async def delete(self, row: CoaGroup | CoaAccount) -> None:
        await self.session.delete(row)
        await self.session.flush()

    async def get_group(self, business_id: str, group_id: str) -> CoaGroup | None:
        result = await self.session.execute(
            select(CoaGroup).where(CoaGroup.business_id == business_id, CoaGroup.id == group_id)
        )
        return result.scalar_one_or_none()

    async def get_account(self, business_id: str, account_id: str) -> CoaAccount | None:
        result = await self.session.execute(
            select(CoaAccount).where(CoaAccount.business_id == business_id, CoaAccount.id == account_id)
        )
        return result.scalar_one_or_none()

    async def existing_account_ids(self, business_id: str, account_ids: set[str]) -> set[str]:
        """Return the subset of account_ids that are COA accounts of the given business."""
        result = await self.session.execute(
            select(CoaAccount.id).where(CoaAccount.business_id == business_id, CoaAccount.id.in_(account_ids))
        )
        return {str(account_id) for account_id in result.scalars().all()}

    async def system_account_id(self, business_id: str, code: str) -> str | None:
        result = await self.session.execute(text(
            "SELECT CAST(a.id AS text) FROM public.coa_accounts a"
            " JOIN public.system_account_types s ON s.id = a.system_account_type_id"
            " WHERE a.business_id = :business_id AND s.code = :code"
        ), {"business_id": business_id, "code": code})
        return result.scalar_one_or_none()

    async def system_account_code(self, account: CoaAccount) -> str | None:
        if account.system_account_type_id is None:
            return None
        result = await self.session.execute(
            text("SELECT code FROM public.system_account_types WHERE id = :id"),
            {"id": account.system_account_type_id},
        )
        return result.scalar_one()

    async def is_used(self, business_id: str, account_id: str) -> bool:
        return bool((await self.session.execute(_IS_USED, {"business_id": business_id, "id": account_id})).scalar())

    async def move_children(self, business_id: str, group_id: str, target_id: str) -> None:
        """Re-parent a group's sub-groups and accounts before the group is deleted."""
        await self.session.execute(
            update(CoaGroup).where(CoaGroup.business_id == business_id, CoaGroup.parent_group_id == group_id)
            .values(parent_group_id=target_id).execution_options(synchronize_session=False)
        )
        await self.session.execute(
            update(CoaAccount).where(CoaAccount.business_id == business_id, CoaAccount.group_id == group_id)
            .values(group_id=target_id).execution_options(synchronize_session=False)
        )

    async def reorder_groups(
        self, business_id: str, type_: str, parent_group_id: str | None, ids: list[str]
    ) -> None:
        await self.session.execute(_REORDER_GROUPS, {
            "ids": ids, "business_id": business_id, "type": type_, "parent_id": parent_group_id,
        })

    async def reorder_accounts(self, business_id: str, group_id: str, ids: list[str]) -> None:
        await self.session.execute(_REORDER_ACCOUNTS, {
            "ids": ids, "business_id": business_id, "group_id": group_id,
        })
