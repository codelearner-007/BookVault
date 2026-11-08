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

    def account_key(self, account_id: str) -> str:
        return next(k for k, v in self.accounts.items() if v == account_id)


@dataclass
class Outcome:
    status_code: int
    body: dict
    entries: list[dict]  # Transaction Journal entries of the posted document (empty if rejected)


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


ADAPTERS: dict[str, Adapter] = {"journal_entry": journal_entry}
# Setup record kinds the runner can create; a fixture needing another kind waits for its phase
# (T08 bank accounts: B3, T95 account groups: B2, T86 divisions: B15).
SUPPORTED_SETUP = {"accounts", "settings"}


def adapter_for(document_type: str) -> Adapter | None:
    return ADAPTERS.get(document_type)


def runner_supports(fixture: dict) -> bool:
    return (
        "document" in fixture
        and adapter_for(fixture["document"]["type"]) is not None
        and set(fixture.get("setup", {})) <= SUPPORTED_SETUP
    )
