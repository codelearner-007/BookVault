"""B7 tax codes and withholding tax (posting-rules PR-16..PR-18, PR-21, PR-29, PR-36, PR-40, PR-41a/b;
BUG-01; D-27): component editor rules, the split of a line's tax, reverse charge, WHT base, receipts."""

from decimal import Decimal

import pytest

from app.services.trade_tax import split_by_weight, split_tax
from tests.support.factories import add_member, create_business
from tests.support.ledger import biz, create_account, journal, system_account_id, trial_balance

DAY = "2026-03-02"


@pytest.fixture
async def books(client, users):
    owner = await users.create("admin")
    bid = (await create_business(client, owner))["id"]
    customer = (await client.post(biz(bid, "/customers"), json={"name": "Customer A"}, headers=owner.headers)).json()
    supplier = (await client.post(biz(bid, "/suppliers"), json={"name": "Supplier X"}, headers=owner.headers)).json()
    income = await create_account(client, owner, bid, "Service income", "income")
    expense = await create_account(client, owner, bid, "Office supplies", "expense")
    return owner, bid, customer["id"], supplier["id"], income, expense


async def _ok(response, status=201):
    assert response.status_code == status, response.text
    return response.json()


async def _tax_code(client, owner, bid, **body):
    return await _ok(await client.post(biz(bid, "/tax-codes"), json=body, headers=owner.headers))


async def _lines_by_account(client, owner, bid, document_id) -> list[tuple[str, Decimal, Decimal]]:
    entries = (await journal(client, owner, bid, document_id))["entries"]
    return sorted((x["account_name"], Decimal(x["debit"]), Decimal(x["credit"])) for e in entries for x in e["lines"])


def test_split_rounds_each_part_and_the_last_takes_the_remainder():
    assert split_tax(Decimal("0.11"), [Decimal(10)], 2) == [Decimal("0.11")]
    assert split_tax(Decimal("30.00"), [Decimal(10), Decimal(5)], 2) == [Decimal("20.00"), Decimal("10.00")]
    parts = split_tax(Decimal("0.10"), [Decimal(1), Decimal(1), Decimal(1)], 2)
    assert parts == [Decimal("0.03"), Decimal("0.03"), Decimal("0.04")] and sum(parts) == Decimal("0.10")
    assert split_by_weight(Decimal(30), [Decimal(200), Decimal(100)], 2) == [Decimal(20), Decimal(10)]


async def test_multi_rate_code_components_and_single_rate_view(client, books):
    owner, bid, *_ = books
    city = await create_account(client, owner, bid, "City tax payable", "liability")
    code = await _tax_code(client, owner, bid, name="Combo 15%", components=[
        {"name": "State", "rate": "10"}, {"name": "City", "rate": "5", "account_id": city}])
    assert code["type"] == "multiple_rates" and Decimal(code["rate"]) == 15
    tax_payable = await system_account_id(client, owner, bid, "tax_payable")
    assert [(c["name"], c["account_id"]) for c in code["components"]] == [("State", tax_payable), ("City", city)]

    both = await client.post(biz(bid, "/tax-codes"), json={"name": "Bad", "rate": "5", "components": [
        {"rate": "5"}]}, headers=owner.headers)
    assert both.status_code == 422
    asset_or_liability = await client.post(biz(bid, "/tax-codes"), json={"name": "Bad2", "components": [
        {"rate": "5", "account_id": await create_account(client, owner, bid, "Fees", "income")}]},
        headers=owner.headers)
    assert asset_or_liability.status_code == 422


async def test_removing_a_used_component_is_refused(client, books):
    owner, bid, customer, _, income, *_ = books
    code = await _tax_code(client, owner, bid, name="Combo", components=[{"rate": "10"}, {"rate": "5"}])
    await _ok(await client.post(biz(bid, "/sales-invoices"), json={
        "date": DAY, "customer_id": customer, "post": True,
        "lines": [{"account_id": income, "qty": "1", "unit_price": "100", "tax_code_id": code["id"]}]},
        headers=owner.headers))
    response = await client.put(biz(bid, f"/tax-codes/{code['id']}"), json={
        "version": code["version"], "components": [{"rate": "10"}]}, headers=owner.headers)
    assert response.status_code == 409 and response.json()["details"]["code"] == "tax_component_in_use"
    renamed = await _ok(await client.put(biz(bid, f"/tax-codes/{code['id']}"), json={
        "version": code["version"], "components": [{"name": "A", "rate": "10"}, {"name": "B", "rate": "5"}]},
        headers=owner.headers), 200)
    assert [c["name"] for c in renamed["components"]] == ["A", "B"]


async def test_snapshot_keeps_posted_rates_when_the_code_changes(client, books):
    """BUG-08: a repost after a rate change keeps the rates the lines were saved with."""
    owner, bid, customer, _, income, *_ = books
    code = await _tax_code(client, owner, bid, name="GST", rate="10")
    invoice = await _ok(await client.post(biz(bid, "/sales-invoices"), json={
        "date": DAY, "customer_id": customer, "post": True,
        "lines": [{"account_id": income, "qty": "1", "unit_price": "100", "tax_code_id": code["id"]}]},
        headers=owner.headers))
    await _ok(await client.put(biz(bid, f"/tax-codes/{code['id']}"), json={"version": code["version"], "rate": "20"},
                               headers=owner.headers), 200)
    again = await _ok(await client.get(biz(bid, f"/sales-invoices/{invoice['id']}"), headers=owner.headers), 200)
    assert again["tax_total"] == "10.00" and again["total"] == "110.00"


async def test_reverse_charge_only_on_purchases(client, books):
    """PR-40 (T55): purchase owes the net; Dr and Cr Tax payable. On a sale the code taxes normally."""
    owner, bid, customer, supplier, income, expense = books
    code = await _tax_code(client, owner, bid, name="RC 10%", rate="10", is_reverse_charge=True)
    purchase = await _ok(await client.post(biz(bid, "/purchase-invoices"), json={
        "date": DAY, "supplier_id": supplier, "post": True,
        "lines": [{"account_id": expense, "qty": "1", "unit_price": "100", "tax_code_id": code["id"]}]},
        headers=owner.headers))
    assert purchase["total"] == "100.00" and purchase["tax_total"] == "0.00"
    assert ("Tax payable", Decimal(10), Decimal(0)) in await _lines_by_account(client, owner, bid, purchase["id"])
    assert ("Tax payable", Decimal(0), Decimal(10)) in await _lines_by_account(client, owner, bid, purchase["id"])
    sale = await _ok(await client.post(biz(bid, "/sales-invoices"), json={
        "date": DAY, "customer_id": customer, "post": True,
        "lines": [{"account_id": income, "qty": "1", "unit_price": "100", "tax_code_id": code["id"]}]},
        headers=owner.headers))
    assert sale["total"] == "110.00"


async def test_wht_base_setting_and_balance_due(client, books):
    """D-27: gross incl. tax by default (T81: 5% x 110 = 5.50); net = 5% x 100."""
    owner, bid, customer, _, income, *_ = books
    code = await _tax_code(client, owner, bid, name="GST", rate="10")
    body = {"date": DAY, "customer_id": customer, "post": True, "withholding_tax": {"type": "percentage", "value": "5"},
            "lines": [{"account_id": income, "qty": "1", "unit_price": "100", "tax_code_id": code["id"]}]}
    gross = await _ok(await client.post(biz(bid, "/sales-invoices"), json=body, headers=owner.headers))
    assert (gross["gross_total"], gross["withholding_tax"]["amount"], gross["total"], gross["balance_due"]) == (
        "110.00", "5.50", "104.50", "104.50")
    settings = await _ok(await client.get(biz(bid, "/settings/withholding-tax"), headers=owner.headers), 200)
    assert settings["wht_base"] == "gross" and settings["wht_receivable_enabled"] is False
    await _ok(await client.put(biz(bid, "/settings/withholding-tax"), json={
        "version": settings["version"], "wht_base": "net"}, headers=owner.headers), 200)
    net = await _ok(await client.post(biz(bid, "/sales-invoices"), json=body, headers=owner.headers))
    assert (net["withholding_tax"]["amount"], net["total"]) == ("5.00", "105.00")
    preview = await _ok(await client.post(biz(bid, "/sales-invoices/totals"), json={
        "withholding_tax": {"type": "percentage", "value": "5"},
        "lines": [{"qty": "1", "unit_price": "100", "tax_code_id": code["id"]}]}, headers=owner.headers), 200)
    assert (preview["gross_total"], preview["withholding_tax"], preview["total"]) == ("110.00", "5.00", "105.00")


async def test_wht_more_than_the_total_is_refused(client, books):
    owner, bid, customer, _, income, *_ = books
    response = await client.post(biz(bid, "/sales-invoices"), json={
        "date": DAY, "customer_id": customer, "post": True, "withholding_tax": {"type": "amount", "value": "150"},
        "lines": [{"account_id": income, "qty": "1", "unit_price": "100"}]}, headers=owner.headers)
    assert response.status_code == 422 and response.json()["details"]["code"] == "total_not_positive"


async def test_withholding_tax_receipt_posts_and_voids_balanced(client, books):
    """PR-36 / BUG-01: with the receivable setting off the receipt still posts both lines."""
    owner, bid, customer, *_ = books
    receipt = await _ok(await client.post(biz(bid, "/withholding-tax-receipts"), json={
        "date": DAY, "customer_id": customer, "amount": "10.00", "post": True}, headers=owner.headers))
    lines = await _lines_by_account(client, owner, bid, receipt["id"])
    assert lines == [("Withholding tax", Decimal(10), Decimal(0)), ("Withholding tax receivable", Decimal(0), Decimal(10))]
    listed = await _ok(await client.get(biz(bid, "/withholding-tax-receipts"), headers=owner.headers), 200)
    assert listed["total"] == 1 and listed["total_amount"] == "10.00"
    await _ok(await client.post(biz(bid, f"/withholding-tax-receipts/{receipt['id']}/void"),
                                json={"version": receipt["version"]}, headers=owner.headers), 200)
    tb = await trial_balance(client, owner, bid)
    assert Decimal(tb["total_debit"]) == Decimal(tb["total_credit"])
    supplier = (await client.get(biz(bid, "/suppliers"), headers=owner.headers)).json()["items"][0]["id"]
    wrong = await client.post(biz(bid, "/withholding-tax-receipts"), json={
        "date": DAY, "customer_id": supplier, "amount": "1", "post": True}, headers=owner.headers)
    assert wrong.status_code == 422


async def test_wht_settings_need_business_details_edit(client, books, users):
    owner, bid, *_ = books
    clerk = await users.create_member(owner, bid)
    await add_member(client, owner, bid, clerk, areas=[{"area_key": "sales_invoices", "rights": ["view"]}])
    settings = await _ok(await client.get(biz(bid, "/settings/withholding-tax"), headers=clerk.headers), 200)
    response = await client.put(biz(bid, "/settings/withholding-tax"), json={
        "version": settings["version"], "wht_receivable_enabled": True}, headers=clerk.headers)
    assert response.status_code == 403
    receipts = await client.get(biz(bid, "/withholding-tax-receipts"), headers=clerk.headers)
    assert receipts.status_code == 403
