"""PR-78: receipts and payments without a bank or cash account post their bank side to Suspense.

Picking an account later is an edit of a posted document: reversal + new entry (version + 1),
which moves the amount out of Suspense onto the bank account. The register of the account
(GET /bank-accounts/{id}/transactions) then lists it with its running balance.
"""

from decimal import Decimal

import pytest
from sqlalchemy import text

from tests.support.factories import add_member, create_bank_account, create_business, receipt_body
from tests.support.ledger import bank_account, biz, create_account, journal, system_account_id, trial_balance

DAY = "2026-11-08"


@pytest.fixture
async def books(client, users):
    owner = await users.create("admin")
    bid = (await create_business(client, owner))["id"]
    bank = await create_bank_account(client, owner, bid, name="Bank")
    sales = await create_account(client, owner, bid, "Service income", "income")
    rent = await create_account(client, owner, bid, "Rent")
    return owner, bid, bank, sales, rent


async def _create(client, owner, bid, body, kind="receipts"):
    response = await client.post(biz(bid, f"/{kind}"), json=body, headers=owner.headers)
    assert response.status_code == 201, response.text
    return response.json()


async def _suspense(client, owner, bid) -> str:
    return (await client.get(biz(bid, "/suspense/balance"), headers=owner.headers)).json()["suspense_balance"]


def _lines(entries) -> list[tuple]:
    return sorted((x["account_id"], x["bank_account_id"], x["debit"], x["credit"]) for e in entries for x in e["lines"])


def _put_body(doc: dict, **changes) -> dict:
    body = {k: doc[k] for k in ("version", "date", "reference", "bank_account_id", "description",
                                "counterparty_party_id", "counterparty_name", "clears_later", "cleared_on")}
    body["lines"] = [{k: x[k] for k in ("account_id", "unit_price", "qty", "discount", "description")}
                     for x in doc["lines"]]
    return {**body, **changes}


async def test_receipt_without_bank_debits_suspense(client, books):
    owner, bid, _, sales, _ = books
    receipt = await _create(client, owner, bid, receipt_body(None, [(sales, "150")]))
    suspense = await system_account_id(client, owner, bid, "suspense")
    entries = (await journal(client, owner, bid, receipt["id"]))["entries"]
    assert receipt["status"] == "posted" and receipt["bank_account_id"] is None
    assert _lines(entries) == sorted([(suspense, None, "150.00", "0.00"), (sales, None, "0.00", "150.00")])
    assert await _suspense(client, owner, bid) == "-150.00"  # credit-positive, like the Summary
    listed = (await client.get(biz(bid, "/suspense/entries"), headers=owner.headers)).json()
    assert [(x["document_id"], x["amount"]) for x in listed["items"]] == [(receipt["id"], "-150.00")]


async def test_payment_without_bank_credits_suspense(client, books):
    owner, bid, _, _, rent = books
    payment = await _create(client, owner, bid, receipt_body(None, [(rent, "80")]), "payments")
    suspense = await system_account_id(client, owner, bid, "suspense")
    entries = (await journal(client, owner, bid, payment["id"]))["entries"]
    assert _lines(entries) == sorted([(suspense, None, "0.00", "80.00"), (rent, None, "80.00", "0.00")])
    assert await _suspense(client, owner, bid) == "80.00"


async def test_picking_a_bank_later_reverses_and_reposts_out_of_suspense(client, books):
    owner, bid, bank, sales, _ = books
    receipt = await _create(client, owner, bid, receipt_body(None, [(sales, "150")]))
    updated = await client.put(biz(bid, f"/receipts/{receipt['id']}"), headers=owner.headers,
                               json=_put_body(receipt, bank_account_id=bank["id"]))
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == receipt["version"] + 1
    entries = (await journal(client, owner, bid, receipt["id"]))["entries"]
    assert sorted(e["source"] for e in entries) == ["document", "document", "reversal"]
    assert await _suspense(client, owner, bid) == "0.00"
    assert (await bank_account(client, owner, bid, bank["id"]))["actual_balance"] == "150.00"
    entries_left = (await client.get(biz(bid, "/suspense/entries"), headers=owner.headers)).json()
    assert entries_left["total"] == 0


async def test_draft_without_bank_posts_to_suspense(client, books):
    owner, bid, _, sales, _ = books
    draft = await _create(client, owner, bid, receipt_body(None, [(sales, "20")], post=False))
    posted = await client.post(biz(bid, f"/receipts/{draft['id']}/post"), json={"version": draft["version"]},
                               headers=owner.headers)
    assert posted.status_code == 200, posted.text
    assert await _suspense(client, owner, bid) == "-20.00"


async def test_cleared_later_needs_a_bank_account(client, books):
    owner, bid, _, sales, _ = books
    response = await client.post(biz(bid, "/receipts"), headers=owner.headers,
                                 json=receipt_body(None, [(sales, "20")], clears_later=True))
    assert response.status_code == 422 and response.json()["details"]["code"] == "cleared_not_allowed"


async def test_unknown_bank_account_still_rejected(client, books, users):
    owner, bid, _, sales, _ = books
    other = (await create_business(client, owner, "Other"))["id"]
    foreign = await create_bank_account(client, owner, other)
    response = await client.post(biz(bid, "/receipts"), headers=owner.headers,
                                 json=receipt_body(foreign["id"], [(sales, "20")]))
    assert response.status_code == 422 and response.json()["details"]["code"] == "bank_account_required"


async def test_cash_invariant_unaffected_by_suspense_documents(client, books, db_conn):
    """INV-2: Cash & cash equivalents = Σ bank accounts; Suspense documents touch neither."""
    owner, bid, bank, sales, rent = books
    await _create(client, owner, bid, receipt_body(bank["id"], [(sales, "100")]))
    await _create(client, owner, bid, receipt_body(None, [(sales, "150")]))
    await _create(client, owner, bid, receipt_body(None, [(rent, "30")]), "payments")
    cash = await system_account_id(client, owner, bid, "cash_control")
    tb = await trial_balance(client, owner, bid)
    control = sum((Decimal(r["debit"]) - Decimal(r["credit"]) for r in tb["rows"] if r["account_id"] == cash),
                  Decimal(0))
    banks = (await client.get(biz(bid, "/bank-accounts"), headers=owner.headers)).json()
    assert control == Decimal(banks["totals"]["actual_balance"]) == Decimal("100")
    assert sum(Decimal(r["debit"]) - Decimal(r["credit"]) for r in tb["rows"]) == 0
    raw = await db_conn.execute(text(
        "SELECT count(*) FROM public.journal_lines WHERE business_id = CAST(:b AS uuid)"
        " AND account_id = CAST(:a AS uuid) AND bank_account_id IS NULL"), {"b": bid, "a": cash})
    assert raw.scalar_one() == 0
    assert await _suspense(client, owner, bid) == "-120.00"


async def test_receipts_clerk_posts_without_bank_but_cannot_read_suspense(client, users, books):
    """Rights: posting needs receipts:create only; the Suspense balance needs suspense:view."""
    owner, bid, _, sales, _ = books
    clerk = await users.create_member(owner, bid)
    await add_member(client, owner, bid, clerk, "custom",
                     [{"area_key": "receipts", "rights": ["view", "create"]}])
    response = await client.post(biz(bid, "/receipts"), headers=clerk.headers,
                                 json=receipt_body(None, [(sales, "15")]))
    assert response.status_code == 201, response.text
    assert (await client.get(biz(bid, "/suspense/balance"), headers=clerk.headers)).status_code == 403
    assert await _suspense(client, owner, bid) == "-15.00"


# ---------------------------------------------------------------- the bank register
async def test_register_lists_every_movement_with_running_balance(client, books):
    owner, bid, bank, sales, rent = books
    first = await _create(client, owner, bid, receipt_body(bank["id"], [(sales, "100")], date="2026-11-01",
                                                           counterparty_name="Walk-in"))
    second = await _create(client, owner, bid, receipt_body(bank["id"], [(rent, "30")], date="2026-11-03"),
                           "payments")
    moved = await _create(client, owner, bid, receipt_body(None, [(sales, "50")], date="2026-11-05"))
    await client.put(biz(bid, f"/receipts/{moved['id']}"), headers=owner.headers,
                     json=_put_body(moved, bank_account_id=bank["id"]))
    url = biz(bid, f"/bank-accounts/{bank['id']}/transactions?date_to=2026-12-31")
    register = (await client.get(url, headers=owner.headers)).json()
    rows = [(x["document_id"], x["received"], x["paid"], x["balance"]) for x in register["items"]]
    assert rows == [(moved["id"], "50.00", "0.00", "120.00"), (second["id"], "0.00", "30.00", "70.00"),
                    (first["id"], "100.00", "0.00", "100.00")]
    assert register["items"][2]["counterparty"] == "Walk-in"
    ranged = (await client.get(f"{url}&date_from=2026-11-02&page_size=1", headers=owner.headers)).json()
    assert ranged["total"] == 2 and ranged["items"][0]["balance"] == "120.00"


async def test_register_rejects_an_inverted_range(client, books):
    owner, bid, bank, _, _ = books
    response = await client.get(biz(bid, f"/bank-accounts/{bank['id']}/transactions"
                                         "?date_from=2026-11-05&date_to=2026-11-01"), headers=owner.headers)
    assert response.status_code == 422 and response.json()["details"]["code"] == "invalid_date_range"


async def test_register_needs_the_bank_accounts_view_right(client, users, books):
    owner, bid, bank, _, _ = books
    clerk = await users.create_member(owner, bid)
    await add_member(client, owner, bid, clerk, "custom", [{"area_key": "receipts", "rights": ["view"]}])
    response = await client.get(biz(bid, f"/bank-accounts/{bank['id']}/transactions"), headers=clerk.headers)
    assert response.status_code == 403
