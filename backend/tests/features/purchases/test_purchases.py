"""B5 suppliers and purchases on the AP sub-ledger (PR-38, PR-41c, PR-42, PR-43, PR-61, PR-64; AC-02)."""

import pytest

from tests.support.factories import create_bank_account, create_business
from tests.support.ledger import biz, create_account, journal, set_lock_date, system_account_id

DAY = "2026-03-02"


@pytest.fixture
async def shop(client, users):
    owner = await users.create("admin")
    bid = (await create_business(client, owner))["id"]
    expense = await create_account(client, owner, bid, "Office supplies", "expense")
    supplier = (await client.post(biz(bid, "/suppliers"), json={"name": "Supplier X"}, headers=owner.headers)).json()
    return owner, bid, expense, supplier["id"]


async def _post(client, owner, path, body):
    return await client.post(path, json=body, headers=owner.headers)


async def _get(client, owner, path):
    response = await client.get(path, headers=owner.headers)
    assert response.status_code == 200, response.text
    return response.json()


def _bill(supplier, expense, amount="100", date=DAY, **extra):
    return {"date": date, "supplier_id": supplier, "post": True,
            "lines": [{"account_id": expense, "qty": "1", "unit_price": amount}], **extra}


async def _pay(client, owner, bid, bank, supplier, amount, invoice_id=None):
    ap = await system_account_id(client, owner, bid, "accounts_payable")
    response = await _post(client, owner, biz(bid, "/payments"), {
        "date": DAY, "bank_account_id": bank, "post": True,
        "lines": [{"account_id": ap, "party_id": supplier, "unit_price": amount, "invoice_id": invoice_id}]})
    assert response.status_code == 201, response.text
    return response.json()


def _sides(entries) -> set:
    return {(x["account_id"], x["debit"], x["credit"]) for e in entries for x in e["lines"]}


async def test_bill_with_tax_partial_payment_status_and_ap(client, shop):
    """PR-38 / T06-T07: input tax debits Tax payable; a named partial payment leaves the bill unpaid; AP from the ledger."""
    owner, bid, expense, supplier = shop
    tax = (await _post(client, owner, biz(bid, "/tax-codes"), {"name": "GST 10%", "rate": "10"})).json()
    body = _bill(supplier, expense, "200", due_date="2026-04-01")
    body["lines"][0]["tax_code_id"] = tax["id"]
    bill = (await _post(client, owner, biz(bid, "/purchase-invoices"), body)).json()
    assert (bill["total"], bill["balance_due"], bill["display_status"], bill["supplier_id"]) == \
        ("220.00", "220.00", "overdue", supplier)  # due 2026-04-01, before today
    ap = await system_account_id(client, owner, bid, "accounts_payable")
    entries = (await journal(client, owner, bid, bill["id"]))["entries"]
    assert (ap, "0.00", "220.00") in _sides(entries) and (expense, "200.00", "0.00") in _sides(entries)
    bank = (await create_bank_account(client, owner, bid))["id"]
    payment = await _pay(client, owner, bid, bank, supplier, "120", bill["id"])
    assert payment["allocations"][0]["amount"] == "120.00" and payment["unallocated_credit"] == "0.00"
    again = await _get(client, owner, biz(bid, f"/purchase-invoices/{bill['id']}"))
    assert again["balance_due"] == "100.00" and again["applied"][0]["document_type"] == "payment"
    listed = await _get(client, owner, biz(bid, "/suppliers"))
    assert (listed["items"][0]["ap_balance"], listed["items"][0]["status"], listed["total_ap_balance"]) == \
        ("100.00", "unpaid", "100.00")
    await _pay(client, owner, bid, bank, supplier, "130")  # Automatic: settles 100, 30 is supplier credit
    paid = await _get(client, owner, biz(bid, f"/purchase-invoices/{bill['id']}"))
    assert (paid["balance_due"], paid["display_status"]) == ("0.00", "paid")
    assert (await _get(client, owner, biz(bid, f"/suppliers/{supplier}")))["status"] == "credit"


async def test_unlinked_debit_note_goes_to_oldest_open_bill(client, shop):
    """PR-43 / T63: Dr AP[supplier, oldest open bill] / Cr expense; stored allocation."""
    owner, bid, expense, supplier = shop
    older = (await _post(client, owner, biz(bid, "/purchase-invoices"), _bill(supplier, expense, "50", "2026-02-01"))).json()
    await _post(client, owner, biz(bid, "/purchase-invoices"), _bill(supplier, expense, "80"))
    note = await _post(client, owner, biz(bid, "/debit-notes"), {
        "date": DAY, "supplier_id": supplier, "post": True, "lines": [{"account_id": expense, "unit_price": "20"}]})
    assert note.status_code == 201, note.text
    assert note.json()["applied"][0]["document_id"] == older["id"]
    assert (await _get(client, owner, biz(bid, f"/purchase-invoices/{older['id']}")))["balance_due"] == "30.00"


async def test_closed_bill_keeps_ledger_and_is_skipped_by_automatic(client, shop):
    """PR-41c / T79: closing posts nothing, the bill stays listed (last) and is never auto-matched."""
    owner, bid, expense, supplier = shop
    closed = (await _post(client, owner, biz(bid, "/purchase-invoices"), _bill(supplier, expense, "100", "2026-02-01"))).json()
    open_bill = (await _post(client, owner, biz(bid, "/purchase-invoices"), _bill(supplier, expense, "60"))).json()
    before = (await journal(client, owner, bid, closed["id"]))["entries"]
    response = await client.put(biz(bid, f"/purchase-invoices/{closed['id']}"), headers=owner.headers, json={
        "version": closed["version"], "date": "2026-02-01", "supplier_id": supplier, "is_closed": True,
        "lines": [{"account_id": expense, "qty": "1", "unit_price": "100"}]})
    assert response.status_code == 200 and response.json()["is_closed"] is True
    assert (await journal(client, owner, bid, closed["id"]))["entries"] == before
    bank = (await create_bank_account(client, owner, bid))["id"]
    await _pay(client, owner, bid, bank, supplier, "60")
    assert (await _get(client, owner, biz(bid, f"/purchase-invoices/{open_bill['id']}")))["balance_due"] == "0.00"
    listed = await _get(client, owner, biz(bid, "/purchase-invoices"))
    assert listed["items"][-1]["id"] == closed["id"] and listed["items"][-1]["balance_due"] == "100.00"
    picker = await _get(client, owner, biz(bid, f"/suppliers/{supplier}/open-invoices"))
    assert picker["total"] == 0
    ap = await system_account_id(client, owner, bid, "accounts_payable")
    named = await _post(client, owner, biz(bid, "/payments"), {
        "date": DAY, "bank_account_id": bank, "post": True,
        "lines": [{"account_id": ap, "party_id": supplier, "unit_price": "10", "invoice_id": closed["id"]}]})
    assert named.status_code == 422 and named.json()["details"]["code"] == "invalid_invoice"


async def test_order_copy_to_invoice_and_goods_receipt_post_nothing(client, shop):
    """Quotes, orders and goods receipts are documents only; copy-to links order -> invoice."""
    owner, bid, expense, supplier = shop
    income = await create_account(client, owner, bid, "Paper sales", "income")
    created = await _post(client, owner, biz(bid, "/non-inventory-items"), {
        "name": "Paper", "income_account_id": income, "expense_account_id": expense})
    assert created.status_code == 201, created.text
    item = created.json()
    order = (await _post(client, owner, biz(bid, "/purchase-orders"), {
        "date": DAY, "supplier_id": supplier, "post": True,
        "lines": [{"item_id": item["id"], "qty": "2", "unit_price": "5"}]})).json()
    assert order["display_status"] == "open" and (await journal(client, owner, bid, order["id"]))["entries"] == []
    prefill = (await _post(client, owner, biz(bid, f"/purchase-orders/{order['id']}/copy-to"),
                           {"target": "purchase_invoice"})).json()["prefill"]
    assert prefill["supplier_id"] == supplier and prefill["source_document_id"] == order["id"]
    bill = (await _post(client, owner, biz(bid, "/purchase-invoices"), {**prefill, "date": DAY, "post": True})).json()
    assert bill["total"] == "10.00" and bill["lines"][0]["account_id"] == expense
    order = await _get(client, owner, biz(bid, f"/purchase-orders/{order['id']}"))
    assert (order["display_status"], order["invoice_status"]) == ("invoiced", "invoiced")
    receipt = (await _post(client, owner, biz(bid, "/goods-receipts"), {
        "date": DAY, "supplier_id": supplier, "post": True, "source_document_id": order["id"],
        "lines": [{"item_id": item["id"], "qty": "2"}]})).json()
    assert (await journal(client, owner, bid, receipt["id"]))["entries"] == []
    assert (await _get(client, owner, biz(bid, f"/purchase-orders/{order['id']}")))["delivery_status"] == "delivered"


async def test_starting_balance_bill_posts_only_its_opening(client, shop):
    """PR-61 / D-36 purchases: Cr AP[supplier, bill] / Dr Retained earnings for the outstanding amount."""
    owner, bid, expense, supplier = shop
    await set_lock_date(client, owner, bid, None, books_start_date="2026-01-01")
    bill = (await _post(client, owner, biz(bid, "/purchase-invoices"),
                        _bill(supplier, expense, "90", "2025-12-10", is_starting_balance=True,
                              paid_before_start="40"))).json()
    assert (bill["balance_due"], bill["paid_before_start"]) == ("50.00", "40.00")
    page = await _get(client, owner, biz(bid, "/starting-balances/purchase-invoices"))
    item = page["items"][0]
    assert (item["supplier_id"], item["outstanding"]) == (supplier, "50.00")
    entries = (await journal(client, owner, bid, item["document_id"]))["entries"]
    ap = await system_account_id(client, owner, bid, "accounts_payable")
    assert (ap, "0.00", "50.00") in _sides(entries)
    assert (await _get(client, owner, biz(bid, f"/suppliers/{supplier}")))["ap_balance"] == "50.00"


async def test_supplier_rules_and_foreign_ids(client, shop, users):
    """A supplier with transactions cannot be deleted; a customer or another business's supplier is rejected (AC-02)."""
    owner, bid, expense, supplier = shop
    await _post(client, owner, biz(bid, "/purchase-invoices"), _bill(supplier, expense))
    current = await _get(client, owner, biz(bid, f"/suppliers/{supplier}"))
    response = await client.delete(biz(bid, f"/suppliers/{supplier}"), params={"version": current["version"]},
                                   headers=owner.headers)
    assert response.status_code == 409 and response.json()["details"]["code"] == "contact_in_use"
    customer = (await _post(client, owner, biz(bid, "/customers"), {"name": "Not a supplier"})).json()
    wrong = await _post(client, owner, biz(bid, "/purchase-invoices"), _bill(customer["id"], expense))
    assert wrong.status_code == 422 and wrong.json()["details"]["code"] == "supplier_required"
    other = await users.create("admin")
    other_bid = (await create_business(client, other))["id"]
    foreign = (await client.post(biz(other_bid, "/suppliers"), json={"name": "Elsewhere"},
                                 headers=other.headers)).json()
    stolen = await _post(client, owner, biz(bid, "/purchase-invoices"), _bill(foreign["id"], expense))
    assert stolen.status_code == 422
    sales_field = await _post(client, owner, biz(bid, "/purchase-invoices"),
                              {**_bill(supplier, expense), "early_discount_rate": "2"})
    assert sales_field.status_code == 422
