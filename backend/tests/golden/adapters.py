"""Document type -> API adapter registry for golden fixtures.

An adapter is an async callable (run: GoldenRun, fixture) -> Outcome. A fixture whose
document type has no adapter is reported "not yet supported" (never silently passes).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import date, timedelta

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
    tax_codes: dict[str, str] = field(default_factory=dict)  # fixture tax code key -> tax code id
    items: dict[str, str] = field(default_factory=dict)  # fixture item key -> item id
    invoices: dict[str, str] = field(default_factory=dict)  # fixture id -> sales invoice document id

    def account_key(self, account_id: str) -> str:
        return next(k for k, v in self.accounts.items() if v == account_id)

    def dimensions(self, line: dict) -> dict:
        """Fixture dimension keys of a Transaction Journal line (bank account, party, invoice, tax code)."""
        found = {}
        for name, ids, column in (("bank_account", self.banks, "bank_account_id"), ("party", self.parties, "party_id"),
                                  ("invoice", self.invoices, "invoice_document_id"),
                                  ("tax_code", self.tax_codes, "tax_code_id")):
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
              "unit_price": x["amount"], **_dimension_ids(run, x), **_invoice_id(run, x)} for x in doc["lines"]]
    return {
        "date": doc["date"], "bank_account_id": run.banks[fields["bank_account"]], "post": True,
        "counterparty_party_id": run.parties.get(fields.get("party")),
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
                {**{k: x[k] for k in ("account_id", "party_id", "description", "qty", "unit_price", "discount")},
                 "invoice_id": x["invoice_id"]}
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
    kind = fixture["document"]["fields"].get("starting_balance_kind")
    if kind == "bank_account":
        return await bank_starting_balance(run, fixture)
    if kind == "sales_invoice":
        return await invoice_starting_balance(run, fixture)
    return await starting_balance(run, fixture)


def _invoice_id(run: GoldenRun, line: dict) -> dict:
    """A receipt line naming an invoice (T98); "automatic" = oldest open invoice first (T05)."""
    invoice = line.get("invoice")
    return {"invoice_id": run.invoices[invoice]} if invoice and invoice != "automatic" else {}


def _trade_lines(run: GoldenRun, lines: list[dict]) -> list[dict]:
    return [{"account_id": run.accounts.get(x.get("account_key")), "item_id": run.items.get(x.get("item")),
             "qty": x.get("qty"), "unit_price": x.get("unit_price") or x.get("amount"),
             "tax_code_id": run.tax_codes.get(x.get("tax_code"))} for x in lines]


ROUNDING = {"round_to_nearest": "nearest", "round_down": "down"}


def _invoice_body(run: GoldenRun, doc: dict) -> dict:
    """PR-16..22, PR-31, PR-61: due Net N days, rounding, discount and late-fee terms, starting balance."""
    fields = doc.get("fields", {})
    body = {"date": doc["date"], "customer_id": run.parties[fields["party"]], "post": True,
            "description": fields.get("description"), "amounts_include_tax": fields.get("amounts_include_tax", False),
            "lines": _trade_lines(run, doc["lines"]), "is_starting_balance": fields.get("is_starting_balance", False)}
    if fields.get("due", {}).get("kind") == "net_days":
        body["due_date"] = (date.fromisoformat(doc["date"]) + timedelta(days=fields["due"]["days"])).isoformat()
    if fields.get("rounding"):
        body["rounding"] = ROUNDING[fields["rounding"]["method"]]
    if discount := fields.get("early_payment_discount"):
        body.update(early_discount_rate=discount["rate"], early_discount_days=discount["days"])
    if fees := fields.get("late_payment_fees"):
        body["late_fee_rate"] = fees["monthly_percent"]
    return body


async def sales_invoice(run: GoldenRun, fixture: dict) -> Outcome:
    """BUG-05 warn (T43): the first post answers credit_limit_warning; the confirmed resend posts."""
    body = _invoice_body(run, fixture["document"])
    path = biz(run.business_id, "/sales-invoices")
    response = await run.client.post(path, headers=run.owner.headers, json=body)
    if response.status_code == 409 and response.json()["details"].get("code") == "credit_limit_warning":
        response = await run.client.post(path, headers=run.owner.headers, json={**body, "credit_limit_override": True})
    outcome = await _with_journal(run, response)
    if outcome.status_code == 201:
        run.invoices[fixture["id"]] = outcome.body["id"]
    return outcome


async def credit_note(run: GoldenRun, fixture: dict) -> Outcome:
    doc = fixture["document"]
    fields = doc.get("fields", {})
    linked = fields.get("linked", {}).get("sales_invoice")
    response = await run.client.post(biz(run.business_id, "/credit-notes"), headers=run.owner.headers, json={
        "date": doc["date"], "customer_id": run.parties[fields["party"]], "post": True,
        "description": fields.get("description"), "invoice_id": run.invoices.get(linked),
        "lines": _trade_lines(run, doc["lines"])})
    return await _with_journal(run, response)


async def late_payment_fee(run: GoldenRun, fixture: dict) -> Outcome:
    """T37 manual fee; T101 confirmed from the pending proposals (dated the charge date)."""
    doc = fixture["document"]
    fields = doc["fields"]
    invoice_id = run.invoices[fields["linked"]["sales_invoice"]]
    if fields.get("created_from") == "pending_late_payment_fees_batch":
        response = await run.client.post(biz(run.business_id, "/late-payment-fees/proposals/confirm"),
                                         headers=run.owner.headers,
                                         json={"items": [{"invoice_id": invoice_id, "charge_date": doc["date"]}]})
        if response.status_code != 201:
            return Outcome(response.status_code, response.json(), [])
        created = response.json()["created"][0]
        assert created["amount"] == fields["amount"], created
        entries = (await journal(run.client, run.owner, run.business_id, created["id"]))["entries"]
        return Outcome(201, created, entries)
    response = await run.client.post(biz(run.business_id, "/late-payment-fees"), headers=run.owner.headers, json={
        "date": doc["date"], "customer_id": run.parties[fields["party"]], "invoice_id": invoice_id,
        "amount": fields["amount"], "post": True})
    return await _with_journal(run, response)


async def invoice_starting_balance(run: GoldenRun, fixture: dict) -> Outcome:
    """T68: paid before the start = an allocation from the invoice's opening document (PR-61, D-36)."""
    fields = fixture["document"]["fields"]
    invoice_id = run.invoices[fields["linked"]["sales_invoice"]]
    response = await run.client.put(biz(run.business_id, f"/starting-balances/sales-invoices/{invoice_id}"),
                                    headers=run.owner.headers, json={"paid_before_start": fields["amount"]})
    body = response.json()
    if response.status_code != 200:
        return Outcome(response.status_code, body, [])
    invoice = (await run.client.get(biz(run.business_id, f"/sales-invoices/{invoice_id}"),
                                    headers=run.owner.headers)).json()
    assert invoice["display_status"] == "paid" and invoice["balance_due"] == "0.00", invoice
    entries = (await journal(run.client, run.owner, run.business_id, body["document_id"]))["entries"]
    return Outcome(201, body, entries)


ADAPTERS: dict[str, Adapter] = {
    "journal_entry": journal_entry_with_actions,
    "starting_balance": any_starting_balance,
    "receipt": cash_transaction("receipts"),
    "payment": cash_transaction("payments"),
    "inter_account_transfer": inter_account_transfer,
    "sales_invoice": sales_invoice,
    "credit_note": credit_note,
    "late_payment_fee": late_payment_fee,
}
# Starting-balance kinds with an adapter (purchase invoices: B5, items: B6).
STARTING_BALANCE_KINDS = {"balance_sheet_account", "bank_account", "sales_invoice"}
# Setup record kinds the runner can create; a fixture needing another kind waits for its phase
# (T86 divisions: B15).
SUPPORTED_SETUP = {"accounts", "settings", "account_groups", "bank_accounts", "parties", "tax_codes", "items"}
# Party kinds the runner can create (suppliers B5, employees B10, special accounts B11).
SUPPORTED_PARTY_KINDS = {"capital_account", "customer"}
# Item kinds the runner can create (inventory items and kits: B6).
SUPPORTED_ITEM_KINDS = {"non_inventory"}
# Tax code types the runner can create (multi-rate and reverse charge: B7).
SUPPORTED_TAX_CODES = {"single_rate"}
# Base-currency bank accounts only until B8; withholding tax arrives in B7.
FOREIGN_FIELDS = {"currency", "exchange_rate", "currency_amount", "debit_currency_amount", "withholding_tax"}


def adapter_for(document_type: str) -> Adapter | None:
    return ADAPTERS.get(document_type)


def _kind_supported(document: dict) -> bool:
    if set(document.get("fields", {})) & FOREIGN_FIELDS:
        return False
    if document["type"] != "starting_balance":
        return True
    return document["fields"].get("starting_balance_kind") in STARTING_BALANCE_KINDS


def _parties_supported(fixture: dict) -> bool:
    data = load_golden_file()["master_data"]
    setup = fixture.get("setup", {})
    return (all(data["parties"][p]["kind"] in SUPPORTED_PARTY_KINDS and "currency" not in data["parties"][p]
                for p in setup.get("parties", []))
            and all(data["items"][i]["kind"] in SUPPORTED_ITEM_KINDS for i in setup.get("items", []))
            and all(data["tax_codes"][t]["type"] in SUPPORTED_TAX_CODES and not data["tax_codes"][t].get("reverse_charge")
                    for t in setup.get("tax_codes", [])))


def runner_supports(fixture: dict) -> bool:
    return (
        "document" in fixture
        and adapter_for(fixture["document"]["type"]) is not None
        and _kind_supported(fixture["document"])
        and set(fixture.get("setup", {})) <= SUPPORTED_SETUP
        and _parties_supported(fixture)
    )
