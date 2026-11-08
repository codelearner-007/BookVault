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
    tax_components: dict[str, str] = field(default_factory=dict)  # fixture component key -> component id
    items: dict[str, str] = field(default_factory=dict)  # fixture item key -> item id
    invoices: dict[str, str] = field(default_factory=dict)  # fixture id -> sales / purchase invoice document id
    documents: dict[str, str] = field(default_factory=dict)  # fixture id -> trade document id (orders, ...)
    locations: dict[str, str] = field(default_factory=dict)  # fixture location key -> inventory location id

    def account_key(self, account_id: str) -> str:
        return next(k for k, v in self.accounts.items() if v == account_id)

    def dimensions(self, line: dict) -> dict:
        """Fixture dimension keys of a Transaction Journal line (bank account, party, invoice, tax code, item)."""
        found = {}
        for name, ids, column in (("bank_account", self.banks, "bank_account_id"), ("party", self.parties, "party_id"),
                                  ("invoice", self.invoices, "invoice_document_id"),
                                  ("tax_code", self.tax_codes, "tax_code_id"), ("item", self.items, "item_id"),
                                  ("tax_component", self.tax_components, "tax_component_id")):
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


def _cleared(run: GoldenRun, bank_key: str | None, cleared: dict | None) -> tuple[bool, str | None]:
    """PR-12: "cleared on a later date" (+ optional date); offered only on accounts that can have
    pending transactions (T65 note: on Bank the field is omitted, the ledger is the same)."""
    if not cleared or cleared.get("mode") != "later_date" or bank_key not in run.pending_banks:
        return False, None
    return True, cleared.get("clear_date")


def _cash_body(run: GoldenRun, doc: dict) -> dict:
    fields = doc.get("fields", {})
    clears_later, cleared_on = _cleared(run, fields.get("bank_account"), fields.get("cleared"))
    contact = fields.get("contact")
    lines = [{"account_id": run.accounts.get(x["account_key"]) if x.get("account_key") else None,
              "unit_price": x["amount"], **_dimension_ids(run, x), **_invoice_id(run, x)} for x in doc["lines"]]
    return {
        # No bank account (T102, T103): the bank side posts to Suspense (PR-78).
        "date": doc["date"], "bank_account_id": run.banks.get(fields.get("bank_account")), "post": True,
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
            clears_later, cleared_on = _cleared(run, fixture["document"]["fields"].get("bank_account"),
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
    if kind == "inventory_item":
        return await inventory_starting_balance(run, fixture)
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


def _withholding(fields: dict) -> dict:
    """fields.withholding_tax {type percentage | amount, rate | amount} -> the request's withholding_tax (B7)."""
    wht = fields.get("withholding_tax")
    if not wht:
        return {}
    return {"withholding_tax": {"type": wht["type"], "value": wht.get("rate") or wht.get("amount")}}


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
    return {**body, **_withholding(fields)}


def _source(run: GoldenRun, fields: dict) -> dict:
    """fields.linked {document type: fixture id} -> the create body's source document (order, ...)."""
    linked = [v for k, v in fields.get("linked", {}).items() if k in ("sales_order", "purchase_order")]
    return {"source_document_id": run.documents[linked[0]]} if linked else {}


async def sales_invoice(run: GoldenRun, fixture: dict) -> Outcome:
    """BUG-05 warn (T43): the first post answers credit_limit_warning; the confirmed resend posts."""
    body = {**_invoice_body(run, fixture["document"]), **_source(run, fixture["document"].get("fields", {}))}
    path = biz(run.business_id, "/sales-invoices")
    response = await run.client.post(path, headers=run.owner.headers, json=body)
    if response.status_code == 409 and response.json()["details"].get("code") == "credit_limit_warning":
        response = await run.client.post(path, headers=run.owner.headers, json={**body, "credit_limit_override": True})
    outcome = await _with_journal(run, response)
    if outcome.status_code == 201:
        run.invoices[fixture["id"]] = run.documents[fixture["id"]] = outcome.body["id"]
    return outcome


def trade_document(path: str, party_field: str, *, priced: bool = True) -> Adapter:
    """Quotes, orders (PR-15), delivery notes and goods receipts (PR-37, PR-44): no ledger lines."""
    async def adapter(run: GoldenRun, fixture: dict) -> Outcome:
        doc = fixture["document"]
        fields = doc.get("fields", {})
        lines = _trade_lines(run, doc["lines"]) if priced else [
            {"item_id": run.items[x["item"]], "qty": x["qty"]} for x in doc["lines"]]
        response = await run.client.post(biz(run.business_id, path), headers=run.owner.headers, json={
            "date": doc["date"], party_field: run.parties[fields["party"]], "post": True, "lines": lines,
            **_source(run, fields)})
        outcome = await _with_journal(run, response)
        if outcome.status_code == 201:
            run.documents[fixture["id"]] = outcome.body["id"]
        return outcome
    return adapter


async def inventory_write_off(run: GoldenRun, fixture: dict) -> Outcome:
    """PR-46: at moving average (BV-01), default location and account."""
    doc = fixture["document"]
    response = await run.client.post(biz(run.business_id, "/inventory-write-offs"), headers=run.owner.headers, json={
        "date": doc["date"], "post": True,
        "lines": [{"item_id": run.items[x["item"]], "qty": x["qty"]} for x in doc["lines"]]})
    return await _with_journal(run, response)


async def inventory_transfer(run: GoldenRun, fixture: dict) -> Outcome:
    """PR-45: quantities between locations, no ledger lines."""
    doc = fixture["document"]
    fields = doc["fields"]
    response = await run.client.post(biz(run.business_id, "/inventory-transfers"), headers=run.owner.headers, json={
        "date": doc["date"], "post": True, "from_location_id": run.locations[fields["from_location"]],
        "to_location_id": run.locations[fields["to_location"]],
        "lines": [{"item_id": run.items[x["item"]], "qty": x["qty"]} for x in doc["lines"]]})
    return await _with_journal(run, response)


async def production_order(run: GoldenRun, fixture: dict) -> Outcome:
    """PR-47: the bill of materials at moving average into the finished item."""
    doc = fixture["document"]
    fields = doc["fields"]
    response = await run.client.post(biz(run.business_id, "/production-orders"), headers=run.owner.headers, json={
        "date": doc["date"], "post": True, "finished_item_id": run.items[fields["finished_item"]],
        "qty": fields["qty"],
        "lines": [{"item_id": run.items[x["item"]], "qty": x["qty"]} for x in doc["lines"]]})
    return await _with_journal(run, response)


async def inventory_starting_balance(run: GoldenRun, fixture: dict) -> Outcome:
    """T69 (PR-62): qty on hand per location + total cost -> one opening entry."""
    fields = fixture["document"]["fields"]
    response = await run.client.put(
        biz(run.business_id, f"/starting-balances/inventory-items/{run.items[fields['item']]}"),
        headers=run.owner.headers, json={"total_cost": fields["total_cost"], "locations": [
            {"location_id": run.locations[x["location"]], "qty": x["qty_on_hand"]}
            for x in fields["qty_on_hand_lines"]]})
    body = response.json()
    if response.status_code != 200:
        return Outcome(response.status_code, body, [])
    entries = (await journal(run.client, run.owner, run.business_id, body["document_id"]))["entries"]
    return Outcome(201, body, entries)


async def credit_note(run: GoldenRun, fixture: dict) -> Outcome:
    doc = fixture["document"]
    fields = doc.get("fields", {})
    linked = fields.get("linked", {}).get("sales_invoice")
    response = await run.client.post(biz(run.business_id, "/credit-notes"), headers=run.owner.headers, json={
        "date": doc["date"], "customer_id": run.parties[fields["party"]], "post": True,
        "description": fields.get("description"), "invoice_id": run.invoices.get(linked),
        "acts_as_stock_movement": fields.get("also_acts_as_delivery_note", False),
        "lines": _trade_lines(run, doc["lines"]), **_withholding(fields)})
    return await _with_journal(run, response)


async def withholding_tax_receipt(run: GoldenRun, fixture: dict) -> Outcome:
    """PR-36 / T39: Dr Withholding tax / Cr WHT receivable[customer], whatever the setting (BUG-01)."""
    doc = fixture["document"]
    fields = doc["fields"]
    response = await run.client.post(biz(run.business_id, "/withholding-tax-receipts"), headers=run.owner.headers,
                                     json={"date": doc["date"], "customer_id": run.parties[fields["party"]],
                                           "amount": fields["amount"], "description": fields.get("description"),
                                           "post": True})
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


def _purchase_body(run: GoldenRun, doc: dict) -> dict:
    """PR-38: due Net N days; the party is the supplier; PR-39: also acts as goods receipt."""
    fields = doc.get("fields", {})
    body = {"date": doc["date"], "supplier_id": run.parties[fields["party"]], "post": True,
            "description": fields.get("description"), "amounts_include_tax": fields.get("amounts_include_tax", False),
            "lines": _trade_lines(run, doc["lines"]), "is_starting_balance": fields.get("is_starting_balance", False),
            "acts_as_stock_movement": fields.get("also_acts_as_goods_receipt", False), **_source(run, fields),
            **_withholding(fields)}
    if fields.get("due", {}).get("kind") == "net_days":
        body["due_date"] = (date.fromisoformat(doc["date"]) + timedelta(days=fields["due"]["days"])).isoformat()
    if freight := fields.get("freight_in"):  # PR-41b; freight tax codes are not supported yet (none in the fixtures)
        body["freight_in"] = [{"amount": x["amount"]} for x in freight]
    return body


async def _purchase_actions(run: GoldenRun, fixture: dict, invoice_id: str) -> list[dict]:
    """T79: tick 'Closed invoice' on the edit form (no ledger effect, PR-41c)."""
    results, path = [], f"/purchase-invoices/{invoice_id}"
    for action in fixture["document"].get("actions", []):
        current = (await run.client.get(biz(run.business_id, path), headers=run.owner.headers)).json()
        body = {k: current[k] for k in ("version", "date", "reference", "supplier_id", "description",
                                        "amounts_include_tax", "due_date")}
        body.update(is_closed=action["fields"].get("closed_invoice", False), lines=[
            {k: x[k] for k in ("item_id", "account_id", "description", "qty", "unit_price", "tax_code_id")}
            for x in current["lines"]])
        response = await run.client.put(biz(run.business_id, path), json=body, headers=run.owner.headers)
        results.append({"seq": action["seq"], "status_code": response.status_code})
    return results


async def purchase_invoice(run: GoldenRun, fixture: dict) -> Outcome:
    response = await run.client.post(biz(run.business_id, "/purchase-invoices"), headers=run.owner.headers,
                                     json=_purchase_body(run, fixture["document"]))
    outcome = await _with_journal(run, response)
    if outcome.status_code == 201:
        run.invoices[fixture["id"]] = run.documents[fixture["id"]] = outcome.body["id"]
        outcome.actions = await _purchase_actions(run, fixture, outcome.body["id"])
        outcome.entries = (await journal(run.client, run.owner, run.business_id, outcome.body["id"]))["entries"]
    return outcome


async def debit_note(run: GoldenRun, fixture: dict) -> Outcome:
    """PR-42 linked / PR-43 unlinked (oldest open purchase invoice first)."""
    doc = fixture["document"]
    fields = doc.get("fields", {})
    linked = fields.get("linked", {}).get("purchase_invoice")
    response = await run.client.post(biz(run.business_id, "/debit-notes"), headers=run.owner.headers, json={
        "date": doc["date"], "supplier_id": run.parties[fields["party"]], "post": True,
        "description": fields.get("description"), "invoice_id": run.invoices.get(linked),
        "lines": _trade_lines(run, doc["lines"])})
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
    "purchase_invoice": purchase_invoice,
    "debit_note": debit_note,
    # B6: orders, quotes and stock documents (fixtures moved from B4 / B5 because they use inventory items)
    "sales_quote": trade_document("/sales-quotes", "customer_id"),
    "sales_order": trade_document("/sales-orders", "customer_id"),
    "delivery_note": trade_document("/delivery-notes", "customer_id", priced=False),
    "purchase_quote": trade_document("/purchase-quotes", "supplier_id"),
    "purchase_order": trade_document("/purchase-orders", "supplier_id"),
    "goods_receipt": trade_document("/goods-receipts", "supplier_id", priced=False),
    "inventory_write_off": inventory_write_off,
    "inventory_transfer": inventory_transfer,
    "production_order": production_order,
    # B7: withholding tax certificates
    "withholding_tax_receipt": withholding_tax_receipt,
}
# Starting-balance kinds with an adapter (purchase invoices: B5, items: B6).
STARTING_BALANCE_KINDS = {"balance_sheet_account", "bank_account", "sales_invoice", "inventory_item"}
# Setup record kinds the runner can create; a fixture needing another kind waits for its phase
# (T86 divisions: B15). dated_records: only manager_only ones (skipped, runner.dated_records).
SUPPORTED_SETUP = {"accounts", "settings", "account_groups", "bank_accounts", "parties", "tax_codes", "items",
                   "inventory_locations", "dated_records"}
# Party kinds the runner can create (employees B10, special accounts B11).
SUPPORTED_PARTY_KINDS = {"capital_account", "customer", "supplier"}
# Item kinds the runner can create.
SUPPORTED_ITEM_KINDS = {"non_inventory", "inventory", "kit"}
# Tax code types the runner can create (single and multiple rates, reverse charge: B7).
SUPPORTED_TAX_CODES = {"single_rate", "multiple_rates"}
# Settings the runner can apply; others belong to later phases (stock B6, WHT B7, currencies B8,
# billable expenses B12).
SUPPORTED_SETTINGS = {"books_start_date", "lock_date", "credit_limit_policy", "allow_negative_stock",
                      "wht_receivable_enabled", "wht_payable_enabled"}
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
    data = load_golden_file()["master_data"]
    setup = fixture.get("setup", {})
    return (all(data["parties"][p]["kind"] in SUPPORTED_PARTY_KINDS and "currency" not in data["parties"][p]
                for p in setup.get("parties", []))
            and all(data["items"][i]["kind"] in SUPPORTED_ITEM_KINDS for i in setup.get("items", []))
            and all(data["tax_codes"][t]["type"] in SUPPORTED_TAX_CODES for t in setup.get("tax_codes", [])))


def _dated_records_supported(fixture: dict) -> bool:
    """Every dated record is Manager-only setup (inventory unit costs, BV-01) or none at all."""
    return all(r.get("applies_to") == "manager_only" for r in fixture.get("setup", {}).get("dated_records", []))


def runner_supports(fixture: dict) -> bool:
    return (
        "document" in fixture
        and _dated_records_supported(fixture)
        and adapter_for(fixture["document"]["type"]) is not None
        and _kind_supported(fixture["document"])
        and set(fixture.get("setup", {})) <= SUPPORTED_SETUP
        and {s["key"] for s in fixture.get("setup", {}).get("settings", [])} <= SUPPORTED_SETTINGS
        and _parties_supported(fixture)
    )
