"""Golden comparator: golden-fixtures.v2.json runner.comparison, applied to BookVault output.

Strict multiset match on (account_key, asserted dimensions, debit, credit, line_date);
an absent dimension is not asserted; amounts compared as Decimal at 2 dp, no tolerance.
"""

from __future__ import annotations

from decimal import Decimal

AMOUNT_DP = Decimal("0.01")


def _amount(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(AMOUNT_DP)


def expected_lines(fixture: dict) -> list[dict]:
    bv = fixture["bookvault_expected"]
    if bv.get("same_as_manager"):
        return fixture["manager_observed"]["journal_lines"]
    return bv.get("journal_lines", [])


def actual_lines(entries: list[dict], key_of, entry_date_of, dimensions_of=lambda line: {}) -> list[dict]:
    """Flatten Transaction Journal entries into comparable lines (dimensions as fixture keys, B3)."""
    return [
        {"account_key": key_of(line["account_id"]), "dimensions": dimensions_of(line),
         "debit": _amount(line["debit"]), "credit": _amount(line["credit"]),
         "line_date": entry_date_of(entry), "entry_id": entry["id"]}
        for entry in entries for line in entry["lines"]
    ]


def _matches(expected: dict, actual: dict) -> bool:
    if (expected["account_key"], _amount(expected["debit"]), _amount(expected["credit"]),
            expected["line_date"]) != (actual["account_key"], actual["debit"], actual["credit"],
                                       actual["line_date"]):
        return False
    dims = actual["dimensions"]
    return all(dims.get(name) == value for name, value in expected.get("dimensions", {}).items())


def unmatched(expected: list[dict], actual: list[dict]) -> tuple[list[dict], list[dict]]:
    """Pair lines one-to-one; returns (expected left over, actual left over)."""
    remaining = list(actual)
    missing = []
    for line in expected:
        hit = next((a for a in remaining if _matches(line, a)), None)
        if hit is None:
            missing.append(line)
        else:
            remaining.remove(hit)
    return missing, remaining


def assert_entry_groups_balanced(entries: list[dict]) -> None:
    """runner.comparison.entry_checks: each entry the lines came from balances."""
    for entry in entries:
        assert _amount(entry["total_debit"]) == _amount(entry["total_credit"]), entry


def assert_rejection(fixture: dict, status_code: int, body: dict) -> None:
    rejection = fixture["bookvault_expected"]["rejection"]
    if rejection.get("http_status") is not None:
        assert status_code == rejection["http_status"], body
    if rejection.get("error_code") is not None:
        assert body.get("details", {}).get("code") == rejection["error_code"], body
    if rejection.get("message") is not None:
        assert body.get("error") == rejection["message"], body
