"""Document type -> API adapter registry for golden fixtures.

An adapter is an async callable (run: GoldenRun, fixture) -> Outcome. A fixture whose
document type has no adapter is reported "not yet supported" (never silently passes).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

import httpx

from tests.support.factories import TestUser
from tests.support.ledger import biz, journal


@dataclass
class GoldenRun:
    """One test business; `accounts` maps fixture account keys to BookVault account ids."""

    client: httpx.AsyncClient
    owner: TestUser
    business_id: str
    accounts: dict[str, str] = field(default_factory=dict)
    groups: dict[str, str] = field(default_factory=dict)

    def account_key(self, account_id: str) -> str:
        return next(k for k, v in self.accounts.items() if v == account_id)


@dataclass
class Outcome:
    status_code: int
    body: dict
    entries: list[dict]  # Transaction Journal entries of the posted document (empty if rejected)
    actions: list[dict] = field(default_factory=list)  # {seq, status_code} per document action


Adapter = Callable[[GoldenRun, dict], Awaitable[Outcome]]


async def journal_entry(run: GoldenRun, fixture: dict) -> Outcome:
    doc = fixture["document"]
    lines = [
        {"account_id": run.accounts[x["account_key"]], "debit": x.get("debit", "0"),
         "credit": x.get("credit", "0"), "description": x.get("description")}
        for x in doc["lines"]
    ]
    response = await run.client.post(
        biz(run.business_id, "/journal-entries"), headers=run.owner.headers,
        json={"date": doc["date"], "post": True, "lines": lines, **doc.get("fields", {})},
    )
    body = response.json()
    if response.status_code != 201:
        return Outcome(response.status_code, body, [])
    entries = (await journal(run.client, run.owner, run.business_id, body["id"]))["entries"]
    return Outcome(response.status_code, body, entries)


async def _delete(run: GoldenRun, path: str) -> httpx.Response:
    current = (await run.client.get(biz(run.business_id, path), headers=run.owner.headers)).json()
    return await run.client.delete(biz(run.business_id, path), params={"version": current["version"]},
                                   headers=run.owner.headers)


async def _run_actions(run: GoldenRun, fixture: dict) -> list[dict]:
    """Document actions after the posting (T95: delete the used account, then its group)."""
    results = []
    for action in fixture["document"].get("actions", []):
        target = action["target"]
        if action["action"] == "delete_account":
            response = await _delete(run, f"/chart-of-accounts/accounts/{run.accounts[target]}")
        else:
            response = await _delete(run, f"/chart-of-accounts/groups/{run.groups[target]}")
        results.append({"seq": action["seq"], "status_code": response.status_code})
    return results


async def journal_entry_with_actions(run: GoldenRun, fixture: dict) -> Outcome:
    outcome = await journal_entry(run, fixture)
    if outcome.status_code == 201:
        outcome.actions = await _run_actions(run, fixture)
    return outcome


async def starting_balance(run: GoldenRun, fixture: dict) -> Outcome:
    """PR-59: a balance-sheet account's starting balance (one opening entry, BV-06)."""
    fields = fixture["document"]["fields"]
    response = await run.client.put(
        biz(run.business_id, f"/starting-balances/accounts/{run.accounts[fields['account']]}"),
        headers=run.owner.headers, json={"side": fields["debit_credit"], "amount": fields["amount"]},
    )
    body = response.json()
    if response.status_code != 200:
        return Outcome(response.status_code, body, [])
    entries = (await journal(run.client, run.owner, run.business_id, body["document_id"]))["entries"]
    return Outcome(201, body, entries)


ADAPTERS: dict[str, Adapter] = {"journal_entry": journal_entry_with_actions, "starting_balance": starting_balance}
# Starting-balance kinds with an adapter (bank accounts: B3, invoices: B4/B5, items: B6).
STARTING_BALANCE_KINDS = {"balance_sheet_account"}
# Setup record kinds the runner can create; a fixture needing another kind waits for its phase
# (T08 bank accounts: B3, T86 divisions: B15).
SUPPORTED_SETUP = {"accounts", "settings", "account_groups"}


def adapter_for(document_type: str) -> Adapter | None:
    return ADAPTERS.get(document_type)


def _kind_supported(document: dict) -> bool:
    if document["type"] != "starting_balance":
        return True
    return document["fields"].get("starting_balance_kind") in STARTING_BALANCE_KINDS


def runner_supports(fixture: dict) -> bool:
    return (
        "document" in fixture
        and adapter_for(fixture["document"]["type"]) is not None
        and _kind_supported(fixture["document"])
        and set(fixture.get("setup", {})) <= SUPPORTED_SETUP
    )
