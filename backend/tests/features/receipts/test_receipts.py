"""B3 receipts and payments on the stored ledger (PR-01, PR-06, PR-07, PR-12, PR-73, PR-74; AC-19..22)."""

from decimal import Decimal

import pytest
from sqlalchemy import text

from tests.support.factories import create_bank_account, create_business, create_contact, receipt_body
from tests.support.ledger import (
    bank_account,
    biz,
    create_account,
    journal,
    post_je,
    set_lock_date,
    system_account_id,
    trial_balance,
)

DAY = "2026-11-08"


@pytest.fixture
async def books(client, users):
    owner = await users.create("admin")
    bid = (await create_business(client, owner))["id"]
    bank = await create_bank_account(client, owner, bid, name="Bank")
    sales = await create_account(client, owner, bid, "Service income", "income")
    other = await create_account(client, owner, bid, "Other income", "income")
    return owner, bid, bank, sales, other


async def _create(client, owner, bid, body, kind="receipts"):
    return await client.post(biz(bid, f"/{kind}"), json=body, headers=owner.headers)


def _lines(entries) -> list[tuple]:
    return sorted((x["account_id"], x["bank_account_id"], x["debit"], x["credit"]) for e in entries for x in e["lines"])


async def test_receipt_with_two_lines_posts_one_entry(client, books):
    owner, bid, bank, sales, other = books
    response = await _create(client, owner, bid, receipt_body(bank["id"], [(sales, "100"), (other, "25.50")]))
    assert response.status_code == 201, response.text
    receipt = response.json()
    cash = await system_account_id(client, owner, bid, "cash_control")
    entries = (await journal(client, owner, bid, receipt["id"]))["entries"]
    assert receipt["total"] == "125.50" and receipt["status"] == "posted" and len(entries) == 1
    assert _lines(entries) == sorted([(cash, bank["id"], "125.50", "0.00"), (sales, None, "0.00", "100.00"),
                                      (other, None, "0.00", "25.50")])
    assert (await bank_account(client, owner, bid, bank["id"]))["actual_balance"] == "125.50"


async def test_payment_mirrors_a_receipt(client, books):
    owner, bid, bank, sales, _ = books
    rent = await create_account(client, owner, bid, "Rent")
    response = await _create(client, owner, bid, receipt_body(bank["id"], [(rent, "40")]), "payments")
    assert response.status_code == 201, response.text
    cash = await system_account_id(client, owner, bid, "cash_control")
    entries = (await journal(client, owner, bid, response.json()["id"]))["entries"]
    assert _lines(entries) == sorted([(cash, bank["id"], "0.00", "40.00"), (rent, None, "40.00", "0.00")])
    assert (await bank_account(client, owner, bid, bank["id"]))["actual_balance"] == "-40.00"


async def test_form_totals_computed_by_the_server(client, books):
    """AC-22 (the posting itself: tests/security/test_integrity_primitives.py)."""
    owner, bid, _, _, _ = books
    totals = await client.post(biz(bid, "/receipts/totals"), headers=owner.headers,
                               json={"lines": [{"qty": "3", "unit_price": "10.005", "discount": "1"}]})
    assert totals.json() == {"lines": [{"amount": "29.02"}], "total": "29.02"}


async def test_line_without_account_rejected(client, books):
    owner, bid, bank, _, _ = books
    response = await _create(client, owner, bid, {**receipt_body(bank["id"], []), "lines": [{"unit_price": "25"}]})
    assert response.status_code == 422 and response.json()["details"]["code"] == "account_required"


async def test_draft_has_no_ledger_effect_then_posts(client, books, db_conn):
    owner, bid, bank, sales, _ = books
    draft = (await _create(client, owner, bid, receipt_body(bank["id"], [(sales, "70")], post=False))).json()
    assert draft["status"] == "draft"
    assert (await journal(client, owner, bid, draft["id"]))["entries"] == []
    posted = await client.post(biz(bid, f"/receipts/{draft['id']}/post"), json={"version": draft["version"]},
                               headers=owner.headers)
    assert posted.status_code == 200 and posted.json()["status"] == "posted"
    assert (await bank_account(client, owner, bid, bank["id"]))["actual_balance"] == "70.00"


def _put_body(doc: dict, **changes) -> dict:
    body = {"version": doc["version"], "date": doc["date"], "reference": doc["reference"],
            "bank_account_id": doc["bank_account_id"], "description": doc["description"],
            "counterparty_party_id": doc["counterparty_party_id"], "counterparty_name": doc["counterparty_name"],
            "clears_later": doc["clears_later"], "cleared_on": doc["cleared_on"],
            "lines": [{"account_id": x["account_id"], "unit_price": x["unit_price"], "qty": x["qty"],
                       "discount": x["discount"], "description": x["description"]} for x in doc["lines"]]}
    body.update(changes)
    return body


async def test_edit_amount_reverses_and_reposts(client, books):
    owner, bid, bank, sales, _ = books
    receipt = (await _create(client, owner, bid, receipt_body(bank["id"], [(sales, "50")]))).json()
    body = _put_body(receipt)
    body["lines"][0]["unit_price"] = "80"
    updated = await client.put(biz(bid, f"/receipts/{receipt['id']}"), json=body, headers=owner.headers)
    assert updated.status_code == 200, updated.text
    sources = [e["source"] for e in (await journal(client, owner, bid, receipt["id"]))["entries"]]
    assert sorted(sources) == ["document", "document", "reversal"] and updated.json()["version"] > receipt["version"]
    assert (await bank_account(client, owner, bid, bank["id"]))["actual_balance"] == "80.00"


async def test_description_and_clear_date_edit_keeps_the_entry(client, users):
    owner = await users.create("admin")
    bid = (await create_business(client, owner))["id"]
    cash = await create_bank_account(client, owner, bid, name="Cash", can_have_pending=True)
    income = await create_account(client, owner, bid, "Service income", "income")
    receipt = (await _create(client, owner, bid, receipt_body(cash["id"], [(income, "40")], clears_later=True))).json()
    assert receipt["is_pending"]
    updated = await client.put(biz(bid, f"/receipts/{receipt['id']}"), headers=owner.headers,
                               json=_put_body(receipt, description="Moved", cleared_on="2026-11-06"))
    assert updated.status_code == 200 and not updated.json()["is_pending"]
    assert len((await journal(client, owner, bid, receipt["id"]))["entries"]) == 1


async def test_void_reverses_and_restores_balance(client, books):
    owner, bid, bank, sales, _ = books
    receipt = (await _create(client, owner, bid, receipt_body(bank["id"], [(sales, "30")]))).json()
    voided = await client.post(biz(bid, f"/receipts/{receipt['id']}/void"), json={"version": receipt["version"]},
                               headers=owner.headers)
    entries = (await journal(client, owner, bid, receipt["id"]))["entries"]
    assert voided.status_code == 200 and voided.json()["status"] == "void"
    assert [e["source"] for e in entries] == ["document", "reversal"]
    assert (await bank_account(client, owner, bid, bank["id"]))["actual_balance"] == "0.00"
    listed = (await client.get(biz(bid, "/receipts"), headers=owner.headers)).json()
    assert listed["total"] == 0 and listed["total_amount"] == "0.00"  # deleted: only in History


async def test_receipt_in_locked_period_rejected(client, books):
    owner, bid, bank, sales, _ = books
    await set_lock_date(client, owner, bid, "2026-01-31")
    response = await _create(client, owner, bid, receipt_body(bank["id"], [(sales, "5")], date="2026-01-20"))
    assert response.status_code == 409
    assert response.json()["error"] == "Transactions dated on or before 2026-01-31 are locked."


async def test_cleared_later_needs_an_account_that_can_have_pending(client, books):
    owner, bid, bank, sales, _ = books
    response = await _create(client, owner, bid, receipt_body(bank["id"], [(sales, "5")], clears_later=True))
    assert response.status_code == 422 and response.json()["details"]["code"] == "cleared_not_allowed"


async def test_cash_line_on_a_receipt_rejected(client, books):
    owner, bid, bank, _, _ = books
    cash = await system_account_id(client, owner, bid, "cash_control")
    response = await _create(client, owner, bid, receipt_body(bank["id"], [(cash, "5")]))
    assert response.status_code == 422 and response.json()["details"]["code"] == "account_not_supported"


async def test_capital_line_needs_a_capital_account_party(client, books):
    """T01 shape: Cr Capital accounts[Owner]; the party is required and must be a capital account."""
    owner, bid, bank, _, _ = books
    capital = await system_account_id(client, owner, bid, "capital_control")
    missing = await _create(client, owner, bid, receipt_body(bank["id"], [(capital, "10")]))
    holder = (await client.post(biz(bid, "/capital-accounts"), json={"name": "Owner"}, headers=owner.headers)).json()
    body = receipt_body(bank["id"], [(capital, "10")])
    body["lines"][0]["party_id"] = holder["id"]
    posted = await _create(client, owner, bid, body)
    listed = (await client.get(biz(bid, "/capital-accounts"), headers=owner.headers)).json()
    assert missing.status_code == 422 and missing.json()["details"]["code"] == "party_required"
    assert posted.status_code == 201, posted.text
    assert listed["items"][0]["balance"] == "-10.00"


async def test_counterparty_and_contact_in_use(client, books):
    owner, bid, bank, sales, _ = books
    customer = await create_contact(client, owner, bid, "customers")
    await _create(client, owner, bid, receipt_body(bank["id"], [(sales, "12")], counterparty_party_id=customer["id"]))
    listed = await client.get(biz(bid, "/receipts"), headers=owner.headers)
    assert listed.json()["items"][0]["counterparty"] == customer["name"]
    deleted = await client.delete(biz(bid, f"/customers/{customer['id']}"), params={"version": customer["version"]},
                                  headers=owner.headers)
    assert deleted.status_code == 409 and deleted.json()["details"]["code"] == "contact_in_use"


async def test_lines_report_lists_posted_lines(client, books):
    owner, bid, bank, sales, other = books
    await _create(client, owner, bid, receipt_body(bank["id"], [(sales, "1"), (other, "2")]))
    await _create(client, owner, bid, receipt_body(bank["id"], [(sales, "3")], post=False))
    report = (await client.get(biz(bid, "/receipts/lines"), headers=owner.headers)).json()
    assert report["total"] == 2 and {x["amount"] for x in report["items"]} == {"1.00", "2.00"}


async def test_suspense_reads_the_ledger(client, books):
    owner, bid, _, sales, _ = books
    suspense = await system_account_id(client, owner, bid, "suspense")
    await post_je(client, owner, bid, DAY, [(sales, "40", "0"), (suspense, "0", "40")])
    balance = (await client.get(biz(bid, "/suspense/balance"), headers=owner.headers)).json()
    entries = (await client.get(biz(bid, "/suspense/entries"), headers=owner.headers)).json()
    assert balance["suspense_balance"] == "40.00"
    assert entries["total"] == 1 and entries["items"][0]["amount"] == "40.00"


async def test_journal_entry_bank_line_needs_its_bank_account(client, books):
    """T08 shape: a Cash & cash equivalents line on a journal entry carries the bank account."""
    owner, bid, bank, sales, _ = books
    cash = await system_account_id(client, owner, bid, "cash_control")
    missing = await post_je(client, owner, bid, DAY, [(sales, "10", "0"), (cash, "0", "10")])
    body = {"date": DAY, "post": True, "lines": [
        {"account_id": sales, "debit": "10", "credit": "0"},
        {"account_id": cash, "debit": "0", "credit": "10", "bank_account_id": bank["id"]}]}
    posted = await client.post(biz(bid, "/journal-entries"), json=body, headers=owner.headers)
    assert missing.status_code == 422 and missing.json()["details"]["code"] == "bank_account_required"
    assert posted.status_code == 201, posted.text
    assert (await bank_account(client, owner, bid, bank["id"]))["actual_balance"] == "-10.00"


async def test_cash_equals_sum_of_bank_accounts(client, books, db_conn):
    """INV-2: the Cash & cash equivalents control balance = Σ bank/cash account balances."""
    owner, bid, bank, sales, other = books
    cash_box = await create_bank_account(client, owner, bid, "15", name="Cash")
    rent = await create_account(client, owner, bid, "Rent")
    await _create(client, owner, bid, receipt_body(bank["id"], [(sales, "100")]))
    await _create(client, owner, bid, receipt_body(cash_box["id"], [(rent, "4")]), "payments")
    await client.post(biz(bid, "/inter-account-transfers"), headers=owner.headers, json={
        "date": DAY, "from_bank_account_id": bank["id"], "to_bank_account_id": cash_box["id"],
        "amount": "30", "post": True})
    cash = await system_account_id(client, owner, bid, "cash_control")
    tb = await trial_balance(client, owner, bid)
    control = sum((Decimal(r["debit"]) - Decimal(r["credit"]) for r in tb["rows"] if r["account_id"] == cash),
                  Decimal(0))
    banks = (await client.get(biz(bid, "/bank-accounts"), headers=owner.headers)).json()
    assert control == Decimal(banks["totals"]["actual_balance"]) == Decimal("111")
    raw = await db_conn.execute(text(
        "SELECT count(*) FROM public.journal_lines WHERE business_id = CAST(:b AS uuid)"
        " AND account_id = CAST(:a AS uuid) AND bank_account_id IS NULL"), {"b": bid, "a": cash})
    assert raw.scalar_one() == 0
