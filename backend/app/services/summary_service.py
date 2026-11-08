"""Summary tab: Balance Sheet as at `to` + Profit and Loss for [from, to], from the stored ledger.

There are no closing entries (PR-70): the Balance Sheet's Retained earnings is the account's
own lines (openings, corrections) plus every P&L line up to `to`, so assets = liabilities +
equity whenever the ledger balances. The P&L total is the sum of all P&L accounts (BUG-06).
"""

from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.core.money import round_money
from app.repositories.coa_repository import CoaRepository
from app.repositories.ledger_query_repository import LedgerQueryRepository
from app.schemas.response.summary import (
    BalanceSheetSummary,
    ProfitAndLossSummary,
    RetainedEarningsSummary,
    SummaryAccount,
    SummaryGroup,
    SummaryResponse,
    SummarySection,
)
from app.services.coa_tree import TreeNode, build_tree, signed
from app.services.posting import PostingService

BALANCE_SHEET = "balance_sheet"
RETAINED_EARNINGS = "retained_earnings"
ZERO = Decimal(0)


def _group(node: TreeNode) -> SummaryGroup:
    return SummaryGroup(
        id=node.group.id, name=node.group.name, total=node.total, groups=[_group(c) for c in node.groups],
        accounts=[SummaryAccount(id=a.id, name=a.name, code=a.code, amount=amt) for a, amt in node.accounts],
    )


def _section(node: TreeNode) -> SummarySection:
    built = _group(node)
    return SummarySection(root_key=node.root.key, name=node.group.name, total=node.total,
                          groups=built.groups, accounts=built.accounts)


class SummaryService:
    def __init__(self, session: AsyncSession) -> None:
        self.queries = LedgerQueryRepository(session)
        self.coa = CoaRepository(session)
        self.posting = PostingService(session)

    async def summary(self, business_id: str, date_from: date, date_to: date) -> SummaryResponse:
        if date_from > date_to:
            raise ValidationError("The start date must be on or before the end date", "from")
        dp = await self.posting.decimals(business_id)
        roots = await self.coa.roots()
        pl_types = {r.account_type for r in roots if r.statement_type != BALANCE_SHEET}
        accounts = [a for a in await self.queries.account_nets(business_id, date_from, date_to) if a.is_visible]
        # Credit-positive profit of every P&L line up to `to`, carried into Retained earnings.
        cumulative = round_money(-sum((a.closing for a in accounts if a.type in pl_types), ZERO), dp)
        re_row = next(a for a in accounts if a.system_account_code == RETAINED_EARNINGS)
        re_ledger = round_money(-re_row.closing, dp)

        def amount(row, root) -> Decimal:
            if root.statement_type != BALANCE_SHEET:
                return round_money(signed(row.period, root.normal_balance), dp)
            value = round_money(signed(row.closing, root.normal_balance), dp)
            return value + cumulative if row.id == re_row.id else value

        nodes = {n.root.key: n for n in build_tree(roots, await self.coa.all_groups(business_id), accounts, amount)}
        assets, liabilities, equity = nodes["assets"], nodes["liabilities"], nodes["equity"]
        income, expenses = nodes["income"], nodes["expenses"]
        return SummaryResponse(
            date_from=date_from, date_to=date_to,
            balance_sheet=BalanceSheetSummary(
                sections=[_section(assets), _section(liabilities), _section(equity)],
                total_assets=assets.total, total_liabilities=liabilities.total, total_equity=equity.total,
                total_liabilities_and_equity=liabilities.total + equity.total,
                is_balanced=assets.total == liabilities.total + equity.total,
            ),
            profit_and_loss=ProfitAndLossSummary(
                sections=[_section(income), _section(expenses)], total_income=income.total,
                total_expenses=expenses.total, net_profit=income.total - expenses.total,
            ),
            retained_earnings=RetainedEarningsSummary(
                account_id=re_row.id, ledger_balance=re_ledger, cumulative_profit=cumulative,
                total=re_ledger + cumulative,
            ),
        )
