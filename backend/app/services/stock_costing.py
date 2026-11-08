"""Moving-average costing of one item's owned stock (BV-01, BV-02 / CD-16, PR-29 BV, PR-69): pure functions.

Owned movements are walked in document-date order (inbound before outbound on the same day, then
posting order). Each movement has a rule:
  fixed    the document sets the value (purchase invoice and debit note line net, starting balance);
  average  outbound at the running average: round(qty x value / qty) (all that is left: all the value);
  return   a credit-note return at the cost the linked invoice charged per unit (unlinked: average, CD-17);
  derived  a production order's finished item: the value given by the caller (its consumed components).
The running quantity may never go below zero (negative stock is rejected, CD-16).
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.core.money import round_money

ZERO = Decimal(0)
FIXED, AVERAGE, RETURN, DERIVED = "fixed", "average", "return", "derived"
FIXED_TYPES = {"purchase_invoice", "debit_note", "opening_balance"}


@dataclass(frozen=True)
class OwnedMove:
    id: str
    document_id: str
    type_key: str
    document_date: date
    location_id: str
    qty: Decimal  # signed qty_owned
    amount: Decimal  # stored signed value


class InsufficientStock(Exception):
    def __init__(self, move: OwnedMove) -> None:
        super().__init__(move.id)
        self.move = move


def rule_of(move: OwnedMove) -> str:
    if move.type_key in FIXED_TYPES:
        return FIXED
    if move.qty < 0:
        return AVERAGE
    if move.type_key == "credit_note":
        return RETURN
    if move.type_key == "production_order":
        return DERIVED
    return FIXED


def walk_order(moves: list[OwnedMove]) -> list[OwnedMove]:
    return sorted(moves, key=lambda m: (m.document_date, 0 if m.qty > 0 else 1, m.id))


def cost(moves: list[OwnedMove], dp: int, *, return_sources: dict[str, list[str]] | None = None,
         derived: dict[str, Decimal] | None = None) -> dict[str, Decimal]:
    """New signed amount per movement id. `return_sources`: credit-note move id -> the linked invoice's
    move ids of the same item; `derived`: production move id -> its value. Raises InsufficientStock."""
    return_sources, derived = return_sources or {}, derived or {}
    amounts: dict[str, Decimal] = {}
    qty = value = last_avg = ZERO
    for move in walk_order(moves):
        rule = rule_of(move)
        if rule == AVERAGE:
            if move.qty + qty < 0:
                raise InsufficientStock(move)
            amount = -value if -move.qty == qty else -round_money(value * -move.qty / qty, dp)
        elif rule == RETURN:
            amount = _return_value(move, return_sources.get(move.id, []), moves, amounts, last_avg, dp)
        elif rule == DERIVED:
            amount = derived.get(move.id, move.amount)
        else:
            amount = move.amount
        if move.qty + qty < 0:
            raise InsufficientStock(move)
        amounts[move.id] = amount
        qty += move.qty
        value += amount
        if qty > 0:
            last_avg = value / qty
    return amounts


def _return_value(move: OwnedMove, source_ids: list[str], moves: list[OwnedMove], amounts: dict[str, Decimal],
                  last_avg: Decimal, dp: int) -> Decimal:
    sources = [m for m in moves if m.id in source_ids]
    charged_qty = -sum((m.qty for m in sources), ZERO)
    if charged_qty > 0:
        charged = -sum((amounts.get(m.id, m.amount) for m in sources), ZERO)
        return round_money(move.qty * charged / charged_qty, dp)
    return round_money(move.qty * last_avg, dp)
