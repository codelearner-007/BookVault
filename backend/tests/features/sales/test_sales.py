"""B4 customers and sales on the AR sub-ledger (PR-15..PR-31, PR-61, PR-64; BUG-05, BUG-07, BUG-08; AC-02, AC-19)."""

import pytest

from tests.support.factories import create_bank_account, create_business
from tests.support.ledger import biz, create_account, journal, set_lock_date, system_account_id

DAY = "2026-03-02"


@pytest.fixture
async def shop(client, users):
    owner = await users.create("admin")
    bid = (await create_business(client, owner))["id"]
    income = await create_account(client, owner, bid, "Service income", "income")
    customer = (await client.post(biz(bid, "/customers"), json={"name": "Customer A"}, headers=owner.headers)).json()
    return owner, bid, income, customer["id"]


async def _post(client, owner, path, body):
    return await client.post(path, json=body, headers=owner.headers)


def _invoice(customer, income, amount="100", **extra):
    return {"date": DAY, "customer_id": customer, "post": True,
            "lines": [{"account_id": income, "qty": "1", "unit_price": amount}], **extra}


async def _get(client, owner, path):
    response = await client.get(path, headers=owner.headers)
    assert response.status_code == 200, response.text
    return response.json()


async def test_tax_code_snapshot_and_per_line_tax(client, shop):
    """PR-16 / BUG-08: tax per line, rounded half away from zero; a later rate change does not move the invoice."""
    owner, bid, income, customer = shop
    tax = (await _post(client, owner, biz(bid, "/tax-codes"), {"name": "GST 10%", "rate": "10"})).json()
    body = _invoice(customer, income)
    body["lines"] = [{"account_id": income, "qty": "3", "unit_price": "1.05", "tax_code_id": tax["id"]}]
    invoice = (await _post(client, owner, biz(bid, "/sales-invoices"), body)).json()
    assert (invoice["subtotal"], invoice["tax_total"], invoice["total"]) == ("3.15", "0.32", "3.47")
    preview = (await _post(client, owner, biz(bid, "/sales-invoices/totals"), {
        "rounding": "nearest", "lines": [{"qty": "3", "unit_price": "1.05", "tax_code_id": tax["id"]}]})).json()
    assert (preview["tax_total"], preview["rounding"], preview["total"]) == ("0.32", "-0.47", "3.00")
    await client.put(biz(bid, f"/tax-codes/{tax['id']}"), json={"version": tax["version"], "rate": "20"},
                     headers=owner.headers)
    again = await _get(client, owner, biz(bid, f"/sales-invoices/{invoice['id']}"))
    assert again["tax_total"] == "0.32" and again["lines"][0]["tax_rate"] == "10.0000"
    response = await client.delete(biz(bid, f"/tax-codes/{tax['id']}"), params={"version": tax["version"] + 1},
                                   headers=owner.headers)
    assert response.status_code == 409 and response.json()["details"]["code"] == "tax_code_in_use"


async def test_credit_limit_warn_then_block(client, shop):
    """BUG-05 / T43: warn asks for confirmation (409) and posts with the override; block refuses."""
    owner, bid, income, _ = shop
    limited = (await _post(client, owner, biz(bid, "/customers"), {"name": "D", "credit_limit": "50"})).json()
    path = biz(bid, "/sales-invoices")
    warned = await _post(client, owner, path, _invoice(limited["id"], income))
    assert warned.status_code == 409 and warned.json()["details"]["code"] == "credit_limit_warning"
    posted = await _post(client, owner, path, _invoice(limited["id"], income, credit_limit_override=True))
    assert posted.status_code == 201 and posted.json()["warnings"][0]["code"] == "credit_limit_exceeded"
    settings = await _get(client, owner, biz(bid, "/settings/sales"))
    await client.put(biz(bid, "/settings/sales"), json={"version": settings["version"], "credit_limit_policy": "block"},
                     headers=owner.headers)
    blocked = await _post(client, owner, path, _invoice(limited["id"], income, "1", credit_limit_override=True))
    assert blocked.status_code == 409 and blocked.json()["details"]["code"] == "credit_limit_exceeded"
    assert (await _get(client, owner, biz(bid, f"/customers/{limited['id']}")))["available_credit"] == "-50.00"


async def test_overpayment_is_customer_credit_and_invoice_void_needs_no_payments(client, shop):
    """PR-03: an overpayment stays as customer credit; an invoice with a receipt cannot be voided."""
    owner, bid, income, customer = shop
    bank = (await create_bank_account(client, owner, bid))["id"]
    ar = await system_account_id(client, owner, bid, "accounts_receivable")
    invoice = (await _post(client, owner, biz(bid, "/sales-invoices"), _invoice(customer, income))).json()
    receipt = (await _post(client, owner, biz(bid, "/receipts"), {
        "date": DAY, "bank_account_id": bank, "post": True,
        "lines": [{"account_id": ar, "party_id": customer, "unit_price": "130"}]})).json()
    assert receipt["unallocated_credit"] == "30.00" and receipt["allocations"][0]["amount"] == "100.00"
    view = await _get(client, owner, biz(bid, f"/sales-invoices/{invoice['id']}"))
    assert (view["balance_due"], view["display_status"]) == ("0.00", "paid")
    customer_row = await _get(client, owner, biz(bid, f"/customers/{customer}"))
    assert (customer_row["ar_balance"], customer_row["status"]) == ("-30.00", "credit")
    response = await _post(client, owner, biz(bid, f"/sales-invoices/{invoice['id']}/void"),
                           {"version": view["version"]})
    assert response.status_code == 409 and response.json()["details"]["code"] == "invoice_has_payments"
    await _post(client, owner, biz(bid, f"/receipts/{receipt['id']}/void"), {"version": receipt["version"]})
    view = await _get(client, owner, biz(bid, f"/sales-invoices/{invoice['id']}"))
    assert view["balance_due"] == "100.00"
    voided = await _post(client, owner, biz(bid, f"/sales-invoices/{invoice['id']}/void"), {"version": view["version"]})
    assert voided.status_code == 200 and voided.json()["display_status"] == "void"


async def test_pre_start_invoice_needs_the_flag_and_posts_no_revenue(client, shop):
    """D-36 / PR-61: test_pre_start_invoice_without_flag_rejected + test_starting_balance_invoice_posts_no_revenue."""
    owner, bid, income, customer = shop
    await set_lock_date(client, owner, bid, None, books_start_date="2026-01-01")
    early = _invoice(customer, income, "75", date="2025-12-15")
    rejected = await _post(client, owner, biz(bid, "/sales-invoices"), early)
    assert rejected.status_code == 422 and rejected.json()["details"]["code"] == "before_books_start"
    invoice = (await _post(client, owner, biz(bid, "/sales-invoices"),
                           {**early, "is_starting_balance": True, "paid_before_start": "25"})).json()
    assert (await journal(client, owner, bid, invoice["id"]))["entries"] == []
    assert (invoice["balance_due"], invoice["paid_before_start"]) == ("50.00", "25.00")
    listed = await _get(client, owner, biz(bid, "/starting-balances/sales-invoices"))
    opening = await journal(client, owner, bid, listed["items"][0]["document_id"])
    assert [(x["debit"], x["credit"]) for x in opening["entries"][0]["lines"]] == [("50.00", "0.00"), ("0.00", "50.00")]
    assert opening["entries"][0]["entry_date"] == "2025-12-31"


async def test_quote_to_order_to_invoice_links_and_statuses(client, shop):
    """PR-15: quotes and orders post nothing; copy-to links them; derived statuses follow the links."""
    owner, bid, income, customer = shop
    quote = (await _post(client, owner, biz(bid, "/sales-quotes"), {
        "date": DAY, "customer_id": customer, "post": True, "expiry_date": "2099-12-31",
        "lines": [{"description": "Design", "qty": "2", "unit_price": "50"}]})).json()
    assert (quote["display_status"], quote["total"]) == ("active", "100.00")
    prefill = (await _post(client, owner, biz(bid, f"/sales-quotes/{quote['id']}/copy-to"),
                           {"target": "sales_order"})).json()["prefill"]
    order = (await _post(client, owner, biz(bid, "/sales-orders"), {**prefill, "post": True})).json()
    assert (await _get(client, owner, biz(bid, f"/sales-quotes/{quote['id']}")))["display_status"] == "accepted"
    assert (order["invoice_status"], order["delivery_status"]) == ("uninvoiced", "pending")
    assert (await _get(client, owner, biz(bid, f"/customers/{customer}")))["uninvoiced"] == "100.00"
    prefill = (await _post(client, owner, biz(bid, f"/sales-orders/{order['id']}/copy-to"),
                           {"target": "sales_invoice"})).json()["prefill"]
    prefill["lines"] = [{**x, "account_id": income} for x in prefill["lines"]]
    invoice = await _post(client, owner, biz(bid, "/sales-invoices"), {**prefill, "post": True})
    assert invoice.status_code == 201, invoice.text
    assert (await _get(client, owner, biz(bid, f"/sales-orders/{order['id']}")))["invoice_status"] == "invoiced"
    assert (await journal(client, owner, bid, order["id"]))["entries"] == []


async def test_late_fee_proposals_monthly_and_confirmed_once(client, shop):
    """PR-31 / T100-T101: the day after the due date, then monthly, up to as_of; a confirmed date is not proposed again."""
    owner, bid, income, customer = shop
    await _post(client, owner, biz(bid, "/sales-invoices"),
                _invoice(customer, income, "200", date="2026-01-01", due_date="2026-01-08", late_fee_rate="2"))
    proposals = await _get(client, owner, biz(bid, "/late-payment-fees/proposals?as_of=2026-03-10"))
    assert [(p["charge_date"], p["amount"]) for p in proposals["items"]] == [
        ("2026-01-09", "4.00"), ("2026-02-09", "4.00"), ("2026-03-09", "4.00")]
    first = proposals["items"][0]
    created = await _post(client, owner, biz(bid, "/late-payment-fees/proposals/confirm"),
                          {"items": [{"invoice_id": first["invoice_id"], "charge_date": first["charge_date"]}]})
    assert created.status_code == 201 and created.json()["created"][0]["date"] == "2026-01-09"
    again = await _get(client, owner, biz(bid, "/late-payment-fees/proposals?as_of=2026-03-10"))
    assert [p["charge_date"] for p in again["items"]] == ["2026-02-09", "2026-03-09"]
    assert again["items"][0]["amount"] == "4.08"  # 2% of the balance due incl. the first fee


async def test_foreign_ids_rejected(client, users, shop):
    """AC-02: another business's customer, account, tax code or item is refused."""
    owner, bid, income, customer = shop
    other = (await create_business(client, owner, "Other"))["id"]
    foreign_income = await create_account(client, owner, other, "Foreign income", "income")
    foreign_customer = (await _post(client, owner, biz(other, "/customers"), {"name": "X"})).json()["id"]
    foreign_tax = (await _post(client, owner, biz(other, "/tax-codes"), {"name": "T", "rate": "5"})).json()["id"]
    path = biz(bid, "/sales-invoices")
    for body, code in ((_invoice(foreign_customer, income), "customer_required"),
                       (_invoice(customer, foreign_income), "invalid_account")):
        response = await _post(client, owner, path, body)
        assert response.status_code == 422 and response.json()["details"]["code"] == code
    taxed = _invoice(customer, income)
    taxed["lines"][0]["tax_code_id"] = foreign_tax
    response = await _post(client, owner, path, taxed)
    assert response.status_code == 422 and response.json()["details"]["code"] == "invalid_tax_code"
    item = await _post(client, owner, biz(bid, "/non-inventory-items"), {"name": "I", "income_account_id": foreign_income})
    assert item.status_code == 422 and item.json()["details"]["code"] == "invalid_account"


async def test_same_idempotency_key_returns_same_invoice(client, shop):
    """AC-19 on invoices: a retried create with the same key posts once."""
    owner, bid, income, customer = shop
    headers = {**owner.headers, "Idempotency-Key": "invoice-retry-1"}
    first = await client.post(biz(bid, "/sales-invoices"), json=_invoice(customer, income), headers=headers)
    second = await client.post(biz(bid, "/sales-invoices"), json=_invoice(customer, income), headers=headers)
    assert first.json()["id"] == second.json()["id"]
    assert (await _get(client, owner, biz(bid, "/sales-invoices")))["total"] == 1


async def test_edit_reposts_and_cannot_go_below_applied(client, shop):
    """PR-73 edit = reversal + new entry; INV-3: not below what a receipt already settled."""
    owner, bid, income, customer = shop
    bank = (await create_bank_account(client, owner, bid))["id"]
    ar = await system_account_id(client, owner, bid, "accounts_receivable")
    invoice = (await _post(client, owner, biz(bid, "/sales-invoices"), _invoice(customer, income, "100"))).json()
    await _post(client, owner, biz(bid, "/receipts"), {"date": DAY, "bank_account_id": bank, "post": True, "lines": [
        {"account_id": ar, "party_id": customer, "invoice_id": invoice["id"], "unit_price": "80"}]})
    body = {**_invoice(customer, income, "120"), "version": invoice["version"]}
    body.pop("post")
    edited = await client.put(biz(bid, f"/sales-invoices/{invoice['id']}"), json=body, headers=owner.headers)
    assert edited.status_code == 200 and edited.json()["balance_due"] == "40.00"
    entries = (await journal(client, owner, bid, invoice["id"]))["entries"]
    assert [e["source"] for e in entries] == ["document", "reversal", "document"]
    body = {**body, "version": edited.json()["version"], "lines": [{"account_id": income, "unit_price": "50"}]}
    response = await client.put(biz(bid, f"/sales-invoices/{invoice['id']}"), json=body, headers=owner.headers)
    assert response.status_code == 409 and response.json()["details"]["code"] == "invoice_below_applied"
