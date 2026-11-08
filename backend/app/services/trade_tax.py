"""Tax, freight-in and withholding-tax splits of trade documents (B7, pure functions).

* A line's tax is one figure rounded half away from zero (T82); a multi-rate code splits it over
  its components by rate, the last component taking the rounding remainder (PR-18).
* Freight-in is capitalised to the inventory lines by line net value; the last line takes the
  remainder, so the parts always add up to the freight (PR-41b BV, T78).
"""

from decimal import Decimal

from app.core.money import round_money

ZERO = Decimal(0)
HUNDRED = Decimal(100)


def split_by_weight(amount: Decimal, weights: list[Decimal], dp: int) -> list[Decimal]:
    """`amount` spread over `weights` pro rata, each part rounded; the last part takes the remainder."""
    total = sum(weights, ZERO)
    if not weights or total == 0:
        return [ZERO] * len(weights)
    parts = [round_money(amount * w / total, dp) for w in weights[:-1]]
    return [*parts, amount - sum(parts, ZERO)]


def split_tax(tax: Decimal, rates: list[Decimal], dp: int) -> list[Decimal]:
    """A line's rounded tax per component (a single component takes all of it)."""
    if len(rates) <= 1:
        return [tax] * len(rates)
    return split_by_weight(tax, rates, dp)


def withholding_amount(wht, base_key: str, subtotal: Decimal, gross_total: Decimal, dp: int) -> Decimal:
    """PR-21 / D-27: rate x base (gross incl. tax and freight by default, else the subtotal) or the amount.
    The same rule as the trade_document_totals view, for the form preview."""
    if wht is None:
        return round_money(ZERO, dp)
    if wht.type == "amount":
        return round_money(wht.value, dp)
    base = subtotal if base_key == "net" else gross_total
    return round_money(base * wht.value / HUNDRED, dp)
