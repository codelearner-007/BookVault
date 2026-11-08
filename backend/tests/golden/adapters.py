"""Document type -> API adapter registry for golden fixtures.

An adapter is an async callable (run: GoldenRun, fixture) -> Outcome. A fixture whose
document type has no adapter is reported "not yet supported" (never silently passes).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

import httpx

from tests.golden.loader import load_golden_file
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
    banks: dict[str, str] = field(default_factory=dict)  # fixture bank key -> bank account id
    pending_banks: set[str] = field(default_factory=set)  # keys of banks that can have pending
    parties: dict[str, str] = field(default_factory=dict)  # fixture party key -> party id

    def account_key(self, account_id: str) -> str:
        return next(k for k, v in self.accounts.items() if v == account_id)

    def dimensions(self, line: dict) -> dict:
        """Fixture dimension keys of a Transaction Journal line (bank account, party)."""
        found = {}
        for name, ids, column in (("bank_account", self.banks, "bank_account_id"), ("party", self.parties, "party_id")):
            key = next((k for k, v in ids.items() if v == line.get(column)), None)
            if key:
                found[name] = key
        return found


@dataclass
class Outcome:
    status_code: int
    body: dict
    entries: list[dict]  # Transaction Journal entries of the posted document (empty if rejected)
    actions: list[dict] = field(default_factory=list)  # {seq, status_code} per document action


Adapter = Callable[[GoldenRun, dict], Awaitable[Outcome]]


def _dimension_ids(run: GoldenRun, line: dict) -> dict:
    dims = line.get("dimensions", {})
    return {
        **({"bank_account_id": run.banks[dims["bank_account"]]} if "bank_account" in dims else {}),
        **({"party_id": run.parties[dims["party"]]} if "party" in dims else {}),
    }


async def _with_journal(run: GoldenRun, response: httpx.Response, ok: int = 201) -> Outcome:
    body = response.json()
    if response.status_code != ok:
        return Outcome(response.status_code, body, [])
    entries = (await journal(run.client, run.owner, run.business_id, body.get("document_id") or body["id"]))["entries"]
    return Outcome(201, body, entries)


def _je_fields(fields: dict) -> dict:
    """Manager's Narration is the journal entry's description (T08)."""
    return {("description" if k == "narration" else k): v for k, v in fields.items()}


async def journal_entry(run: GoldenRun, fixture: dict) -> Outcome:
    doc = fixture["document"]
    lines = [
        {"account_id": run.accounts[x["account_key"]], "debit": x.get("debit", "0"),
         "credit": x.get("credit", "0"), "description": x.get("description"), **_dimension_ids(run, x)}
        for x in doc["lines"]
    ]
    response = await run.client.post(
        biz(run.business_id, "/journal-entries"), headers=run.owner.headers,
        json={"date": doc["date"], "post": True, "lines": lines, **_je_fields(doc.get("fields", {}))},
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


def _cleared(run: GoldenRun, bank_key: str, cleared: dict | None) -> tuple[bool, str | None]:
    """PR-12: "cleared on a later date" (+ optional date); offered only on accounts that can have
    pending transactions (T65 note: on Bank the field is omitted, the ledger is the same)."""
    if not cleared or cleared.get("mode") != "later_date" or bank_key not in run.pending_banks:
        return False, None
    return True, cleared.get("clear_date")


def _cash_body(run: GoldenRun, doc: dict) -> dict:
    fields = doc.get("fields", {})
    clears_later, cleared_on = _cleared(run, fields["bank_account"], fields.get("cleared"))
    contact = fields.get("contact")
    lines = [{"account_id": run.accounts.get(x["account_key"]) if x.get("account_key") else None,
              "unit_price": x["amount"], **_dimension_ids(run, x)} for x in doc["lines"]]
    return {
        "date": doc["date"], "bank_account_id": run.banks[fields["bank_account"]], "post": True,
        "counterparty_name": contact if fields.get("payer_kind", fields.get("payee_kind")) == "other" else None,
        "clears_later": clears_later, "cleared_on": cleared_on,
        # T41: lines unspecified; the lock date is checked before the lines.
        "lines": lines or [{"unit_price": "1.00"}],
    }


async def _cash_actions(run: GoldenRun, fixture: dict, kind: str, created: dict) -> list[dict]:
    """T83: edit the clear date; T74: delete = void (PR-74)."""
    results, path = [], f"/{kind}/{created['id']}"
    for action in fixture["document"].get("actions", []):
        current = (await run.client.get(biz(run.business_id, path), headers=run.owner.headers)).json()
        if action["action"] == "delete_document":
            response = await run.client.post(biz(run.business_id, f"{path}/void"), json={"version": current["version"]},
                                             headers=run.owner.headers)
        else:
            clears_later, cleared_on = _cleared(run, fixture["document"]["fields"]["bank_account"],
                                                action["fields"].get("cleared"))
            body = {k: current[k] for k in ("version", "date", "reference", "bank_account_id", "description",
                                            "counterparty_party_id", "counterparty_name")}
            body.update(clears_later=clears_later, cleared_on=cleared_on, lines=[
                {k: x[k] for k in ("account_id", "party_id", "description", "qty", "unit_price", "discount")}
                for x in current["lines"]])
            response = await run.client.put(biz(run.business_id, path), json=body, headers=run.owner.headers)
        results.append({"seq": action["seq"], "status_code": response.status_code})
    return results


def cash_transaction(kind: str) -> Adapter:
    async def adapter(run: GoldenRun, fixture: dict) -> Outcome:
        response = await run.client.post(biz(run.business_id, f"/{kind}"), headers=run.owner.headers,
                                         json=_cash_body(run, fixture["document"]))
        outcome = await _with_journal(run, response)
        if outcome.status_code == 201:
            outcome.actions = await _cash_actions(run, fixture, kind, outcome.body)
            outcome.entries = (await journal(run.client, run.owner, run.business_id, outcome.body["id"]))["entries"]
        return outcome
    return adapter


async def inter_account_transfer(run: GoldenRun, fixture: dict) -> Outcome:
    """PR-10: credit side = paid from, debit side = received in; one currency (B8 adds FX)."""
    doc = fixture["document"]
    fields = doc["fields"]
    from_later, from_on = _cleared(run, fields["from_bank_account"], fields.get("credit_cleared"))
    to_later, to_on = _cleared(run, fields["to_bank_account"], fields.get("debit_cleared"))
    response = await run.client.post(biz(run.business_id, "/inter-account-transfers"), headers=run.owner.headers, json={
        "date": doc["date"], "from_bank_account_id": run.banks[fields["from_bank_account"]],
        "to_bank_account_id": run.banks[fields["to_bank_account"]], "amount": fields["credit_amount"],
        "from_clears_later": from_later, "from_cleared_on": from_on,
        "to_clears_later": to_later, "to_cleared_on": to_on, "post": True,
    })
    return await _with_journal(run, response)


async def bank_starting_balance(run: GoldenRun, fixture: dict) -> Outcome:
    """T67: the bank or cash account's own two-line opening entry (D-35)."""
    fields = fixture["document"]["fields"]
    response = await run.client.put(
        biz(run.business_id, f"/starting-balances/bank-accounts/{run.banks[fields['bank_account']]}"),
        headers=run.owner.headers, json={"side": "debit", "amount": fields["amount"]},
    )
    return await _with_journal(run, response, ok=200)


async def any_starting_balance(run: GoldenRun, fixture: dict) -> Outcome:
    if fixture["document"]["fields"].get("starting_balance_kind") == "bank_account":
        return await bank_starting_balance(run, fixture)
    return await starting_balance(run, fixture)


ADAPTERS: dict[str, Adapter] = {
    "journal_entry": journal_entry_with_actions,
    "starting_balance": any_starting_balance,
    "receipt": cash_transaction("receipts"),
    "payment": cash_transaction("payments"),
    "inter_account_transfer": inter_account_transfer,
}
# Starting-balance kinds with an adapter (invoices: B4/B5, items: B6).
STARTING_BALANCE_KINDS = {"balance_sheet_account", "bank_account"}
# Setup record kinds the runner can create; a fixture needing another kind waits for its phase
# (T86 divisions: B15).
SUPPORTED_SETUP = {"accounts", "settings", "account_groups", "bank_accounts", "parties"}
# Party kinds the runner can create (customers B4, suppliers B5, employees B10, special accounts B11).
SUPPORTED_PARTY_KINDS = {"capital_account"}
# Base-currency bank accounts only until B8.
FOREIGN_FIELDS = {"currency", "exchange_rate", "currency_amount", "debit_currency_amount"}


def adapter_for(document_type: str) -> Adapter | None:
    return ADAPTERS.get(document_type)


def _kind_supported(document: dict) -> bool:
    if set(document.get("fields", {})) & FOREIGN_FIELDS:
        return False
    if document["type"] != "starting_balance":
        return True
    return document["fields"].get("starting_balance_kind") in STARTING_BALANCE_KINDS


def _parties_supported(fixture: dict) -> bool:
    specs = load_golden_file()["master_data"]["parties"]
    return all(specs[p]["kind"] in SUPPORTED_PARTY_KINDS for p in fixture.get("setup", {}).get("parties", []))


def runner_supports(fixture: dict) -> bool:
    return (
        "document" in fixture
        and adapter_for(fixture["document"]["type"]) is not None
        and _kind_supported(fixture["document"])
        and set(fixture.get("setup", {})) <= SUPPORTED_SETUP
        and _parties_supported(fixture)
    )
