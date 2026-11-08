"""Customer / supplier totals (invoiced / received, billed / paid) and the party transactions list."""

import pytest

from tests.support.factories import add_member, create_bank_account, create_business
from tests.support.ledger import biz, create_account, system_account_id

DAY = "2026-03-02"
LATER = "2026-03-09"


@pytest.fixture
async def book(client, users):
    owner = await users.create("admin")
    bid = (await create_business(client, owner))["id"]
    income = await create_account(client, owner, bid, "Service income", "income")
    expense = await create_account(client, owner, bid, "Office supplies", "expense")
    bank = (await create_bank_account(client, owner, bid))["id"]
    customer = (await client.post(biz(bid, "/customers"), json={"name": "Customer A"}, headers=owner.headers)).json()
    supplier = (await client.post(biz(bid, "/suppliers"), json={"name": "Supplier X"}, headers=owner.headers)).json()
    return owner, bid, income, expense, bank, customer["id"], supplier["id"]


async def _post(client, owner, path, body):
    response = await client.post(path, json=body, headers=owner.headers)
    assert response.status_code in (200, 201), response.text
    return response.json()


async def _get(client, user, path, **params):
    response = await client.get(path, headers=user.headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _trade(party_field, party, account, amount, date=DAY):
    return {"date": date, party_field: party, "post": True,
            "lines": [{"account_id": account, "qty": "1", "unit_price": amount}]}


def _cash(bank, account, amount, date=DAY, party=None, counterparty=None):
    return {"date": date, "bank_account_id": bank, "post": True, "counterparty_party_id": counterparty,
            "lines": [{"account_id": account, "party_id": party, "unit_price": amount}]}


async def test_customer_totals_count_receipts_to_any_account(client, book):
    owner, bid, income, _, bank, customer, _ = book
    ar = await system_account_id(client, owner, bid, "accounts_receivable")
    await _post(client, owner, biz(bid, "/sales-invoices"), _trade("customer_id", customer, income, "100"))
    note = await _post(client, owner, biz(bid, "/credit-notes"), _trade("customer_id", customer, income, "10"))
    await _post(client, owner, biz(bid, "/receipts"), _cash(bank, ar, "40", party=customer))
    # Paid by the customer but posted straight to income: received, AR untouched.
    await _post(client, owner, biz(bid, "/receipts"), _cash(bank, income, "25", counterparty=customer))
    draft = _cash(bank, income, "999", counterparty=customer) | {"post": False}
    await _post(client, owner, biz(bid, "/receipts"), draft)
    void = await _post(client, owner, biz(bid, "/receipts"), _cash(bank, income, "500", counterparty=customer))
    await _post(client, owner, biz(bid, f"/receipts/{void['id']}/void"), {"version": void["version"]})

    listed = await _get(client, owner, biz(bid, "/customers"))
    row = listed["items"][0]
    assert (row["total_invoiced"], row["total_received"], row["ar_balance"]) == ("90.00", "65.00", "50.00")
    assert (listed["total_invoiced"], listed["total_received"], listed["total_ar_balance"]) == ("90.00", "65.00", "50.00")
    view = await _get(client, owner, biz(bid, f"/customers/{customer}"))
    assert (view["total_invoiced"], view["total_received"]) == ("90.00", "65.00")

    tx = await _get(client, owner, biz(bid, f"/customers/{customer}/transactions"))
    assert tx["total"] == 4
    rows = {(r["document_type"], r["amount_in"], r["amount_out"]) for r in tx["items"]}
    assert rows == {("sales_invoice", "0.00", "100.00"), ("credit_note", "10.00", "0.00"),
                    ("receipt", "40.00", "0.00"), ("receipt", "25.00", "0.00")}
    assert tx["items"][0]["balance"] == "50.00"  # newest first; running AR balance
    assert note["id"] in {r["document_id"] for r in tx["items"]}


async def test_transactions_date_filter_keeps_running_balance(client, book):
    owner, bid, income, _, bank, customer, _ = book
    ar = await system_account_id(client, owner, bid, "accounts_receivable")
    await _post(client, owner, biz(bid, "/sales-invoices"), _trade("customer_id", customer, income, "100"))
    await _post(client, owner, biz(bid, "/receipts"), _cash(bank, ar, "30", LATER, party=customer))
    tx = await _get(client, owner, biz(bid, f"/customers/{customer}/transactions"), date_from=LATER)
    assert tx["total"] == 1
    assert (tx["items"][0]["amount_in"], tx["items"][0]["balance"]) == ("30.00", "70.00")


async def test_receipt_without_invoice_is_customer_credit_then_applied(client, book):
    """Money from a customer with no invoice: AR credit; the next invoice absorbs it."""
    owner, bid, income, _, bank, customer, _ = book
    ar = await system_account_id(client, owner, bid, "accounts_receivable")
    await _post(client, owner, biz(bid, "/receipts"), _cash(bank, ar, "500", party=customer, counterparty=customer))
    assert (await _get(client, owner, biz(bid, f"/customers/{customer}")))["ar_balance"] == "-500.00"
    invoice = await _post(client, owner, biz(bid, "/sales-invoices"), _trade("customer_id", customer, income, "800", LATER))
    assert any(a["is_credit_application"] for a in invoice["applied"])
    assert invoice["balance_due"] == "300.00"
    assert (await _get(client, owner, biz(bid, f"/customers/{customer}")))["ar_balance"] == "300.00"


async def test_payment_without_bill_is_supplier_advance_then_applied(client, book):
    owner, bid, _, expense, bank, _, supplier = book
    ap = await system_account_id(client, owner, bid, "accounts_payable")
    await _post(client, owner, biz(bid, "/payments"), _cash(bank, ap, "200", party=supplier, counterparty=supplier))
    assert (await _get(client, owner, biz(bid, f"/suppliers/{supplier}")))["ap_balance"] == "-200.00"
    bill = await _post(client, owner, biz(bid, "/purchase-invoices"), _trade("supplier_id", supplier, expense, "350", LATER))
    assert any(a["is_credit_application"] for a in bill["applied"])
    assert bill["balance_due"] == "150.00"
    row = (await _get(client, owner, biz(bid, "/suppliers")))["items"][0]
    assert (row["ap_balance"], row["total_billed"], row["total_paid"]) == ("150.00", "350.00", "200.00")
    tx = await _get(client, owner, biz(bid, f"/suppliers/{supplier}/transactions"))
    assert [(r["document_type"], r["amount_in"], r["amount_out"], r["balance"]) for r in tx["items"]] == [
        ("purchase_invoice", "350.00", "0.00", "150.00"), ("payment", "0.00", "200.00", "-200.00")]


async def test_totals_follow_rights_and_tenant(client, users, book):
    owner, bid, income, _, bank, customer, _ = book
    await _post(client, owner, biz(bid, "/sales-invoices"), _trade("customer_id", customer, income, "100"))
    await _post(client, owner, biz(bid, "/receipts"), _cash(bank, income, "25", counterparty=customer))
    member = await users.create_member(owner, bid)
    await add_member(client, owner, bid, member, "custom", [{"area_key": "customers", "rights": ["view"]}])
    row = (await _get(client, member, biz(bid, "/customers")))["items"][0]
    assert (row["total_invoiced"], row["total_received"]) == ("0.00", "0.00")
    assert (await _get(client, member, biz(bid, f"/customers/{customer}/transactions")))["total"] == 0

    stranger = await users.create("admin")
    other = (await create_business(client, stranger))["id"]
    assert (await _get(client, stranger, biz(other, "/customers")))["total_received"] == "0.00"
    response = await client.get(biz(bid, f"/customers/{customer}/transactions"), headers=stranger.headers)
    assert response.status_code in (403, 404)
    response = await client.get(biz(other, f"/customers/{customer}/transactions"), headers=stranger.headers)
    assert response.status_code == 404
