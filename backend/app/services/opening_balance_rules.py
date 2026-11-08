"""Which accounts take a starting balance, and how its two lines read (pure; posting-rules §10)."""

from decimal import Decimal

from app.core.money import round_money

BALANCE_SHEET_ROOTS = {"assets", "liabilities", "equity"}
# The plug of every opening entry, and the account that only ever receives differences.
NO_OPENING_SYSTEM_CODES = {"retained_earnings", "suspense"}
NO_SUBLEDGER = "none"


def can_have_opening_balance(root_key: str, system_code: str | None, subledger_kind: str | None) -> bool:
    """Balance-sheet accounts; system accounts only without a sub-ledger (bank, party, item, ... have
    their own per-record starting balances in later phases) and never Retained earnings / Suspense."""
    if root_key not in BALANCE_SHEET_ROOTS:
        return False
    if system_code is None:
        return True
    return subledger_kind == NO_SUBLEDGER and system_code not in NO_OPENING_SYSTEM_CODES


def opening_side(debit: Decimal, credit: Decimal, dp: int) -> dict:
    """The record's own opening line as {side, amount} at the base currency's decimal places."""
    if debit > 0:
        return {"side": "debit", "amount": round_money(debit, dp)}
    return {"side": "credit", "amount": round_money(credit, dp)}
