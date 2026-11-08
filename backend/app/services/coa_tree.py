"""Chart tree assembly shared by the COA tree and the Summary (pure, no I/O).

Groups nest under the 5 fixed roots; an account's amount is its ledger net (debit - credit)
turned to the root's normal side, so every group total is the sum of its children.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy.engine import Row

from app.models.coa_group import CoaGroup

DEBIT = "debit"


def signed(net: Decimal, normal_balance: str) -> Decimal:
    """Ledger net (Dr +, Cr -) shown on the root's normal side."""
    return net if normal_balance == DEBIT else -net


@dataclass
class TreeNode:
    group: CoaGroup
    root: Row  # coa_root_groups row: key, name, statement_type, account_type, normal_balance
    groups: list[TreeNode] = field(default_factory=list)
    accounts: list[tuple[Row, Decimal]] = field(default_factory=list)
    total: Decimal = Decimal(0)


def build_tree(
    roots: list[Row], groups: list[CoaGroup], accounts: list[Row],
    amount: Callable[[Row, Row], Decimal],
) -> list[TreeNode]:
    """One node per fixed root (in root order); amount(account_row, root_row) gives each leaf."""
    children: dict[str | None, list[CoaGroup]] = defaultdict(list)
    for group in groups:
        children[group.parent_group_id].append(group)
    leaves: dict[str, list[Row]] = defaultdict(list)
    for account in accounts:
        leaves[account.group_id].append(account)

    def node(group: CoaGroup, root: Row) -> TreeNode:
        built = TreeNode(group, root, [node(c, root) for c in children[group.id]])
        built.accounts = [(a, amount(a, root)) for a in leaves[group.id]]
        built.total = sum((g.total for g in built.groups), Decimal(0)) + sum(
            (amt for _, amt in built.accounts), Decimal(0)
        )
        return built

    by_root = {g.root_key: g for g in groups if g.root_key}
    return [node(by_root[r.key], r) for r in roots if r.key in by_root]


def descendants(groups: list[CoaGroup], group_id: str) -> set[str]:
    """Ids of every group below group_id (not itself)."""
    children: dict[str | None, list[str]] = defaultdict(list)
    for group in groups:
        children[group.parent_group_id].append(group.id)
    found, stack = set(), list(children[group_id])
    while stack:
        gid = stack.pop()
        if gid not in found:
            found.add(gid)
            stack.extend(children[gid])
    return found


def root_key_of(groups: list[CoaGroup], group_id: str) -> str | None:
    """The fixed root a group belongs to (walks up; None for an unknown id)."""
    by_id = {g.id: g for g in groups}
    seen: set[str] = set()
    current = by_id.get(group_id)
    while current is not None and current.id not in seen:
        if current.root_key:
            return current.root_key
        seen.add(current.id)
        current = by_id.get(current.parent_group_id)
    return None
