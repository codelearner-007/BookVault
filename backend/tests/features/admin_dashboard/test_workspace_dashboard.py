"""GET /me/dashboard: per-business ledger figures by right, cross-tenant isolation, recent activity."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import text

from tests.support.factories import add_member, create_bank_account, create_business, create_contact
from tests.support.ledger import biz, create_account, system_account_id, trial_balance

URL = "/api/v1/me/dashboard"
TODAY = date.today().isoformat()
LAST_YEAR = f"{date.today().year - 1}-06-01"


async def _post(client, user, business_id, day, lines):
    """lines: (account_id, debit, credit, extra dimension fields)."""
    body = {"date": day, "post": True, "lines": [
        {"account_id": a, "debit": d, "credit": c, **extra} for a, d, c, extra in lines]}
    response = await client.post(biz(business_id, "/journal-entries"), json=body, headers=user.headers)
    assert response.status_code == 201, response.text


@pytest.fixture
async def books(client, users, db_conn):
    """A small posted ledger: opening bank 1000, sale on account 300, rent on account 120,
    last year's cash sale 50 (outside this year's profit), 10 cash into Suspense."""
    owner = await users.create()
    bid = (await create_business(client, owner, "Northwind"))["id"]
    bank = await create_bank_account(client, owner, bid, opening="1000")
    customer = await create_contact(client, owner, bid, "customers")
    supplier = await create_contact(client, owner, bid, "suppliers")
    sales = await create_account(client, owner, bid, "Sales", "income")
    owed_to_us = await create_account(client, owner, bid, "Placeholder receivable", "asset")
    owed_by_us = await create_account(client, owner, bid, "Placeholder payable", "liability")
    rent = await create_account(client, owner, bid, "Rent", "expense")
    cash, ar, ap, suspense = [await system_account_id(client, owner, bid, code) for code in
                              ("cash_control", "accounts_receivable", "accounts_payable", "suspense")]
    on_bank = {"bank_account_id": bank["id"]}
    await _post(client, owner, bid, TODAY, [(owed_to_us, "300", "0", {}), (sales, "0", "300", {})])
    await _post(client, owner, bid, TODAY, [(rent, "120", "0", {}), (owed_by_us, "0", "120", {})])
    await _retarget(db_conn, bid, owed_to_us, ar, customer["id"])
    await _retarget(db_conn, bid, owed_by_us, ap, supplier["id"])
    await _post(client, owner, bid, LAST_YEAR, [(cash, "50", "0", on_bank), (sales, "0", "50", {})])
    await _post(client, owner, bid, TODAY, [(cash, "10", "0", on_bank), (suspense, "0", "10", {})])
    return owner, bid


async def _retarget(db_conn, business_id, from_account, to_account, party_id):
    """Move posted lines onto a control account. Receivables and payables have no posting path until
    invoices exist (B4), so the fixture rewrites the line in SQL (triggers off for this statement only,
    inside the test's rolled-back transaction)."""
    await db_conn.execute(text("SET LOCAL session_replication_role = replica"))
    await db_conn.execute(
        text("UPDATE public.journal_lines SET account_id = CAST(:to AS uuid), party_id = CAST(:party AS uuid)"
             " WHERE business_id = CAST(:bid AS uuid) AND account_id = CAST(:from AS uuid)"),
        {"to": to_account, "party": party_id, "bid": business_id, "from": from_account},
    )
    await db_conn.execute(text("SET LOCAL session_replication_role = origin"))


def _only(body: dict, business_id: str) -> dict:
    return next(item for item in body["items"] if item["id"] == business_id)


async def test_owner_sees_every_figure_from_the_ledger(client, books):
    owner, bid = books
    response = await client.get(URL, headers=owner.headers)

    assert response.status_code == 200, response.text
    body = response.json()
    item = _only(body, bid)
    assert item["figures"] == {"cash_and_bank": "1060.00", "receivables": "300.00", "payables": "120.00",
                               "net_profit": "180.00", "suspense": "10.00", "overdue_invoices": 0,
                               "overdue_amount": "0.00"}
    assert item["is_owner"] is True and item["member_count"] == 1
    assert item["decimal_places"] == 2 and item["last_activity_at"] is not None
    assert body["as_at"] == TODAY and body["period_from"] == f"{date.today().year}-01-01"
    assert body["total"] == 1 and body["total_pages"] == 1


async def test_member_without_view_rights_gets_no_figures(client, users, books):
    owner, bid = books
    member = await users.create_member(owner, bid)
    await add_member(client, owner, bid, member, "custom", [])

    item = _only((await client.get(URL, headers=member.headers)).json(), bid)

    assert item["figures"] == {"cash_and_bank": None, "receivables": None, "payables": None,
                               "net_profit": None, "suspense": None, "overdue_invoices": None,
                               "overdue_amount": None}
    assert item["is_owner"] is False and item["member_count"] is None


async def test_member_sees_only_the_figures_of_areas_they_can_view(client, users, books):
    owner, bid = books
    member = await users.create_member(owner, bid)
    await add_member(client, owner, bid, member, "custom", [{"area_key": "customers", "rights": ["view"]}])

    figures = _only((await client.get(URL, headers=member.headers)).json(), bid)["figures"]

    assert figures == {"cash_and_bank": None, "receivables": "300.00", "payables": None,
                       "net_profit": None, "suspense": None, "overdue_invoices": None, "overdue_amount": None}


async def test_full_access_member_sees_every_figure(client, users, books):
    owner, bid = books
    member = await users.create_member(owner, bid)
    await add_member(client, owner, bid, member, "full")

    figures = _only((await client.get(URL, headers=member.headers)).json(), bid)["figures"]

    assert figures["cash_and_bank"] == "1060.00" and figures["net_profit"] == "180.00"


@pytest.mark.parametrize("role", ["admin", "super_admin"])
async def test_other_tenants_never_appear(client, users, books, role):
    """Not a member: no business, no figures, no activity, whatever the platform role."""
    owner, bid = books
    outsider = await users.create(role)
    mine = (await create_business(client, outsider, "Mine"))["id"]

    body = (await client.get(URL, headers=outsider.headers)).json()

    assert [item["id"] for item in body["items"]] == [mine]
    assert all(event["business_id"] == mine for event in body["activity"])


async def test_activity_is_limited_to_what_the_caller_may_read(client, users, books):
    """The owner reads every event; a member without History sees only their own."""
    owner, bid = books
    member = await users.create_member(owner, bid)
    await add_member(client, owner, bid, member, "custom", [])

    owner_activity = (await client.get(URL, headers=owner.headers)).json()["activity"]
    member_activity = (await client.get(URL, headers=member.headers)).json()["activity"]

    assert 0 < len(owner_activity) <= 8
    assert owner_activity[0]["business_name"] == "Northwind" and owner_activity[0]["is_mine"] is True
    assert [a["created_at"] for a in owner_activity] == sorted((a["created_at"] for a in owner_activity), reverse=True)
    assert member_activity == []


async def test_businesses_are_paginated_and_searchable(client, users):
    owner = await users.create()
    for name in ("Alpha", "Beta", "Gamma"):
        await create_business(client, owner, name)

    page = (await client.get(f"{URL}?page=2&page_size=2", headers=owner.headers)).json()
    found = (await client.get(f"{URL}?search=amm", headers=owner.headers)).json()
    wildcard = (await client.get(f"{URL}?search=%25", headers=owner.headers)).json()

    assert page["total"] == 3 and page["total_pages"] == 2 and [i["name"] for i in page["items"]] == ["Gamma"]
    assert [i["name"] for i in found["items"]] == ["Gamma"]
    assert wildcard["total"] == 0


# ---------------------------------------------------------------- sales on the ledger (B4)
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()
TOMORROW = (date.today() + timedelta(days=1)).isoformat()


@pytest.fixture
async def shop(client, users):
    """Three posted invoices: 100 overdue, 60 overdue but paid 25 by a receipt, 40 not yet due."""
    owner = await users.create()
    bid = (await create_business(client, owner, "Shop"))["id"]
    bank = await create_bank_account(client, owner, bid)
    income = await create_account(client, owner, bid, "Service income", "income")
    customer = await create_contact(client, owner, bid, "customers")
    ar = await system_account_id(client, owner, bid, "accounts_receivable")
    for amount, due in (("100", YESTERDAY), ("60", YESTERDAY), ("40", TOMORROW)):
        invoice = await client.post(biz(bid, "/sales-invoices"), headers=owner.headers, json={
            "date": YESTERDAY, "due_date": due, "customer_id": customer["id"], "post": True,
            "lines": [{"account_id": income, "qty": "1", "unit_price": amount}]})
        assert invoice.status_code == 201, invoice.text
        if amount == "60":
            receipt = await client.post(biz(bid, "/receipts"), headers=owner.headers, json={
                "date": TODAY, "bank_account_id": bank["id"], "post": True, "lines": [
                    {"account_id": ar, "party_id": customer["id"], "invoice_id": invoice.json()["id"],
                     "unit_price": "25"}]})
            assert receipt.status_code == 201, receipt.text
    return owner, bid


async def test_overdue_invoices_and_receivables_read_the_ledger(client, shop):
    """Overdue = posted, due before today, balance due > 0; Receivables = the AR control account."""
    owner, bid = shop
    figures = _only((await client.get(URL, headers=owner.headers)).json(), bid)["figures"]
    tb = await trial_balance(client, owner, bid)
    ar = await system_account_id(client, owner, bid, "accounts_receivable")
    ar_balance = sum(Decimal(r["debit"]) - Decimal(r["credit"]) for r in tb["rows"] if r["account_id"] == ar)

    assert (figures["overdue_invoices"], figures["overdue_amount"]) == (2, "135.00")
    assert Decimal(figures["receivables"]) == ar_balance == Decimal("175")
    assert figures["payables"] == "0.00"


async def test_overdue_needs_the_sales_invoices_view_right(client, users, shop):
    owner, bid = shop
    member = await users.create_member(owner, bid)
    await add_member(client, owner, bid, member, "custom", [{"area_key": "customers", "rights": ["view"]}])
    viewer = await users.create_member(owner, bid)
    await add_member(client, owner, bid, viewer, "custom", [{"area_key": "sales_invoices", "rights": ["view"]}])

    hidden = _only((await client.get(URL, headers=member.headers)).json(), bid)["figures"]
    shown = _only((await client.get(URL, headers=viewer.headers)).json(), bid)["figures"]

    assert (hidden["overdue_invoices"], hidden["overdue_amount"], hidden["receivables"]) == (None, None, "175.00")
    assert (shown["overdue_invoices"], shown["overdue_amount"], shown["receivables"]) == (2, "135.00", None)
