"""Ledger invariants that apply in B1 (domain-model §8: INV-1, INV-5 TB part, INV-6, INV-8)
and the database backstops behind the posting service (the service bypassed, in SQL)."""

import asyncio
import random
import uuid
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, ProgrammingError

from app.main import app
from tests.conftest import CSRF_HEADER
from tests.support.factories import TEST_BOOKS_START, create_bank_account, create_business, receipt_body
from tests.support.ledger import (
    biz,
    create_account,
    journal,
    post_je,
    set_lock_date,
    system_account_id,
    trial_balance,
)

API_ROLE = "bookvault_api"
DAY = "2026-05-01"


@pytest.fixture
async def books(client, users):
    owner = await users.create("admin")
    bid = (await create_business(client, owner))["id"]
    accounts = [await create_account(client, owner, bid, f"Account {i}") for i in range(4)]
    return owner, bid, accounts


async def _scalar(conn, sql: str, **params):
    return (await conn.execute(text(sql), params)).scalar_one()


async def _random_activity(client, owner, bid, accounts, seed: int) -> None:
    """Random balanced entries, edits and voids (a small property test)."""
    rng = random.Random(seed)
    posted = []
    for _ in range(8):
        debit_acct, credit_acct = rng.sample(accounts, 2)
        amount = str(Decimal(rng.randint(1, 100_000)) / 100)
        doc = (await post_je(client, owner, bid, DAY, [(debit_acct, amount, "0"), (credit_acct, "0", amount)])).json()
        posted.append(doc)
    for doc in rng.sample(posted, 3):
        await client.post(biz(bid, f"/journal-entries/{doc['id']}/void"),
                          json={"version": doc["version"]}, headers=owner.headers)


async def test_every_transaction_balances(client, books, db_conn):
    """INV-1 (AC-22): every entry and the whole business balance, after edits and voids."""
    owner, bid, accounts = books
    await _random_activity(client, owner, bid, accounts, seed=7)
    unbalanced = await _scalar(db_conn, """
        SELECT count(*) FROM (SELECT journal_entry_id FROM public.journal_lines
        WHERE business_id = CAST(:b AS uuid) GROUP BY journal_entry_id
        HAVING sum(debit) <> sum(credit)) x""", b=bid)
    business_net = await _scalar(db_conn, "SELECT COALESCE(sum(debit - credit), 0) FROM public.journal_lines"
                                 " WHERE business_id = CAST(:b AS uuid)", b=bid)
    assert unbalanced == 0 and business_net == 0


async def test_trial_balance_sums_to_zero(client, books):
    """INV-5 (TB part): total debits = total credits on the Trial Balance."""
    owner, bid, accounts = books
    await _random_activity(client, owner, bid, accounts, seed=11)
    tb = await trial_balance(client, owner, bid)
    assert tb["rows"] and tb["total_debit"] == tb["total_credit"]


async def test_void_exactly_negates(client, books):
    """INV-6: after a void every account balance is back to its prior value."""
    owner, bid, (a, b, *_) = books
    await post_je(client, owner, bid, DAY, [(a, "7", "0"), (b, "0", "7")])
    before = await trial_balance(client, owner, bid)
    doc = (await post_je(client, owner, bid, DAY, [(a, "3.33", "0"), (b, "0", "3.33")])).json()
    await client.post(biz(bid, f"/journal-entries/{doc['id']}/void"),
                      json={"version": doc["version"]}, headers=owner.headers)
    assert await trial_balance(client, owner, bid) == before


# ---------------------------------------------------------------- database backstops (SQL)

async def _document(conn, bid: str, owner_id: str, date: str = DAY) -> str:
    return await _scalar(conn, """
        INSERT INTO public.documents (business_id, document_type_id, status_id, area_key, document_date,
                                      created_by, updated_by)
        SELECT CAST(:b AS uuid), t.id, s.id, 'journal_entries', CAST(CAST(:d AS text) AS date), CAST(:u AS uuid), CAST(:u AS uuid)
        FROM public.document_types t, public.document_statuses s
        WHERE t.key = 'journal_entry' AND s.key = 'posted'
        RETURNING id::text""", b=bid, u=owner_id, d=date)


async def _entry(conn, bid: str, doc_id: str, owner_id: str, date: str = DAY, reverses: str | None = None) -> str:
    return await _scalar(conn, """
        INSERT INTO public.journal_entries (business_id, document_id, source_id, entry_date, posted_by,
                                            reverses_entry_id)
        SELECT CAST(:b AS uuid), CAST(:doc AS uuid), s.id, CAST(CAST(:d AS text) AS date), CAST(:u AS uuid),
               CAST(:rev AS uuid)
        FROM public.journal_entry_sources s WHERE s.key = CASE WHEN CAST(:rev AS uuid) IS NULL THEN 'document' ELSE 'reversal' END
        RETURNING id::text""", b=bid, doc=doc_id, u=owner_id, d=date, rev=reverses)


async def _line(conn, bid: str, entry_id: str, no: int, account: str, debit: str, credit: str) -> None:
    await conn.execute(text("""
        INSERT INTO public.journal_lines (business_id, journal_entry_id, line_no, account_id, debit, credit)
        VALUES (CAST(:b AS uuid), CAST(:e AS uuid), :no, CAST(:a AS uuid), CAST(CAST(:dr AS text) AS numeric), CAST(CAST(:cr AS text) AS numeric))
    """), {"b": bid, "e": entry_id, "no": no, "a": account, "dr": debit, "cr": credit})


async def _commit_point(conn):
    """Run the deferred constraint triggers now (what COMMIT would do)."""
    await conn.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))


async def test_unbalanced_entry_cannot_commit_even_bypassing_service(books, db_conn):
    owner, bid, (a, b, *_) = books
    entry = await _entry(db_conn, bid, await _document(db_conn, bid, owner.id), owner.id)
    await _line(db_conn, bid, entry, 1, a, "10", "0")
    await _line(db_conn, bid, entry, 2, b, "0", "9")
    savepoint = await db_conn.begin_nested()
    with pytest.raises(DBAPIError, match="Debits and credits must be equal"):
        await _commit_point(db_conn)
    await savepoint.rollback()


async def test_reversal_must_mirror_the_original(books, db_conn):
    owner, bid, (a, b, c, _) = books
    doc = await _document(db_conn, bid, owner.id)
    original = await _entry(db_conn, bid, doc, owner.id)
    await _line(db_conn, bid, original, 1, a, "5", "0")
    await _line(db_conn, bid, original, 2, b, "0", "5")
    reversal = await _entry(db_conn, bid, doc, owner.id, reverses=original)
    await _line(db_conn, bid, reversal, 1, c, "0", "5")  # wrong account
    await _line(db_conn, bid, reversal, 2, b, "5", "0")
    savepoint = await db_conn.begin_nested()
    with pytest.raises(DBAPIError, match="exactly negate"):
        await _commit_point(db_conn)
    await savepoint.rollback()


@pytest.mark.parametrize("role", ["postgres", API_ROLE])
@pytest.mark.parametrize("statement", [
    "UPDATE public.journal_lines SET debit = debit + 1 WHERE business_id = CAST(:b AS uuid)",
    "DELETE FROM public.journal_lines WHERE business_id = CAST(:b AS uuid)",
    "UPDATE public.journal_entries SET entry_date = entry_date + 1 WHERE business_id = CAST(:b AS uuid)",
    "DELETE FROM public.journal_entries WHERE business_id = CAST(:b AS uuid)",
])
async def test_posted_lines_cannot_be_updated_or_deleted(client, books, db_conn, role, statement):
    owner, bid, (a, b, *_) = books
    await post_je(client, owner, bid, DAY, [(a, "1", "0"), (b, "0", "1")])
    savepoint = await db_conn.begin_nested()
    if role != "postgres":
        await db_conn.execute(text(f'SET LOCAL ROLE "{role}"'))
        await db_conn.execute(text("SELECT set_config('app.user_id', :u, true)"), {"u": owner.id})
    with pytest.raises((DBAPIError, ProgrammingError)):
        await db_conn.execute(text(statement), {"b": bid})
    await savepoint.rollback()


async def test_trigger_blocks_insert_before_lock_date(client, books, db_conn):
    """INV-8 straight in SQL: an entry dated on the (inclusive) lock date is refused."""
    owner, bid, _ = books
    doc = await _document(db_conn, bid, owner.id, "2026-04-01")
    await set_lock_date(client, owner, bid, "2026-04-30")
    savepoint = await db_conn.begin_nested()
    with pytest.raises(DBAPIError, match="on or before 2026-04-30 are locked"):
        await _entry(db_conn, bid, doc, owner.id, "2026-04-30")
    await savepoint.rollback()


# ---------------------------------------------------------------- mode C (real commits)

@pytest.mark.committed
async def test_parallel_numbering_unique(committed, live_client):
    owner = await committed.create("admin")
    bid = (await create_business(live_client, owner))["id"]
    a = await create_account(live_client, owner, bid, "Parallel A")
    b = await create_account(live_client, owner, bid, "Parallel B")
    responses = await asyncio.gather(*[
        post_je(live_client, owner, bid, DAY, [(a, "1", "0"), (b, "0", "1")], post=False) for _ in range(8)
    ])
    assert {r.status_code for r in responses} == {201}
    assert sorted(int(r.json()["reference"]) for r in responses) == list(range(1, 9))


@pytest.mark.committed
async def test_business_is_committed_before_the_response_is_sent(committed, live_client):
    """B0 read-after-write race: when the 201 starts, the business is already committed,
    so the next request (here a journal entry in that business) sees it at once."""
    owner = await committed.create("admin")
    seen_at_response_start: list[int] = []

    async def probe_app(scope, receive, send):
        async def checked_send(message):
            if message["type"] == "http.response.start" and scope["method"] == "POST":
                seen_at_response_start.append(await _scalar(
                    committed.conn, "SELECT count(*) FROM public.businesses WHERE owner_id = CAST(:u AS uuid)",
                    u=owner.id))
            await send(message)
        await app(scope, receive, checked_send)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=probe_app), base_url="http://test",
        headers={CSRF_HEADER: "web", "Idempotency-Key": str(uuid.uuid4())},
    ) as probe:
        business = await probe.post("/api/v1/businesses", json={"name": "Race", "books_start_date": TEST_BOOKS_START},
                                    headers=owner.headers)
    assert business.status_code == 201 and seen_at_response_start == [1]
    bid = business.json()["id"]
    a = await create_account(live_client, owner, bid, "Race A")
    b = await create_account(live_client, owner, bid, "Race B")
    entry = await post_je(live_client, owner, bid, DAY, [(a, "2", "0"), (b, "0", "2")])
    assert entry.status_code == 201
    assert (await journal(live_client, owner, bid, entry.json()["id"]))["entries"]


async def test_summary_balances_and_retained_earnings_is_computed(client, users):
    """B2 invariants: assets = liabilities + equity; BS retained earnings = openings + cumulative P&L."""
    owner = await users.create()
    bid = (await create_business(client, owner))["id"]
    prepaid = await create_account(client, owner, bid, "Prepaid", "asset")
    loan = await create_account(client, owner, bid, "Loan", "liability")
    sales = await create_account(client, owner, bid, "Sales", "income")
    rent = await create_account(client, owner, bid, "Rent", "expense")
    for account, side, amount in ((prepaid, "debit", "400"), (loan, "credit", "150")):
        await client.put(biz(bid, f"/starting-balances/accounts/{account}"), headers=owner.headers,
                         json={"side": side, "amount": amount})
    await post_je(client, owner, bid, "2025-03-01", [(prepaid, "90", "0"), (sales, "0", "90")])
    await post_je(client, owner, bid, DAY, [(rent, "35", "0"), (loan, "0", "35")])

    response = await client.get(biz(bid, f"/reports/summary?from=2026-01-01&to={DAY}"), headers=owner.headers)
    body = response.json()
    bs, re_ = body["balance_sheet"], body["retained_earnings"]

    assert bs["is_balanced"] and bs["total_assets"] == bs["total_liabilities_and_equity"] == "490.00"
    assert (re_["ledger_balance"], re_["cumulative_profit"], re_["total"]) == ("250.00", "55.00", "305.00")
    assert body["profit_and_loss"]["net_profit"] == "-35.00"


# ---------------------------------------------------------------- B3 banking (INV-1, INV-2, INV-6)


async def _random_banking(client, owner, bid, accounts, banks, rng) -> None:
    """Receipts, payments and transfers between random accounts; some edited, some voided."""
    created = []
    for _ in range(10):
        kind = rng.choice(["receipts", "payments", "inter-account-transfers"])
        amount = str(Decimal(rng.randint(1, 50_000)) / 100)
        if kind == "inter-account-transfers":
            src, dst = rng.sample(banks, 2)
            body = {"date": DAY, "from_bank_account_id": src, "to_bank_account_id": dst, "amount": amount, "post": True}
        else:
            body = receipt_body(rng.choice(banks), [(rng.choice(accounts), amount)], date=DAY)
        response = await client.post(biz(bid, f"/{kind}"), json=body, headers=owner.headers)
        assert response.status_code == 201, response.text
        created.append((kind, response.json()))
    for kind, doc in rng.sample(created, 3):
        await client.post(biz(bid, f"/{kind}/{doc['id']}/void"), json={"version": doc["version"]},
                          headers=owner.headers)


@pytest.mark.parametrize("seed", [3, 17])
async def test_cash_equals_sum_of_bank_accounts(client, books, db_conn, seed):
    """INV-2: Cash & cash equivalents = Σ bank and cash accounts; INV-1 every entry balances."""
    owner, bid, accounts = books
    banks = [(await create_bank_account(client, owner, bid, name=f"Bank {i}"))["id"] for i in range(3)]
    await _random_banking(client, owner, bid, accounts, banks, random.Random(seed))
    cash = await system_account_id(client, owner, bid, "cash_control")
    control = await _scalar(db_conn, "SELECT COALESCE(sum(debit - credit), 0) FROM public.journal_lines"
                            " WHERE business_id = CAST(:b AS uuid) AND account_id = CAST(:a AS uuid)", b=bid, a=cash)
    listed = (await client.get(biz(bid, "/bank-accounts"), headers=owner.headers)).json()
    each = sum((Decimal(x["actual_balance"]) for x in listed["items"]), Decimal(0))
    without_bank = await _scalar(db_conn, "SELECT count(*) FROM public.journal_lines WHERE business_id = CAST(:b AS uuid)"
                                 " AND account_id = CAST(:a AS uuid) AND bank_account_id IS NULL", b=bid, a=cash)
    business_net = await _scalar(db_conn, "SELECT COALESCE(sum(debit - credit), 0) FROM public.journal_lines"
                                 " WHERE business_id = CAST(:b AS uuid)", b=bid)
    assert control == each == Decimal(listed["totals"]["actual_balance"])
    assert without_bank == 0 and business_net == 0


async def test_void_receipt_exactly_negates(client, books):
    """INV-6 for a typed document: a voided receipt leaves every balance as before."""
    owner, bid, (a, *_) = books
    bank = (await create_bank_account(client, owner, bid))["id"]
    before = await trial_balance(client, owner, bid)
    doc = (await client.post(biz(bid, "/receipts"), json=receipt_body(bank, [(a, "12.34")], date=DAY),
                             headers=owner.headers)).json()
    await client.post(biz(bid, f"/receipts/{doc['id']}/void"), json={"version": doc["version"]}, headers=owner.headers)
    assert await trial_balance(client, owner, bid) == before


# ---------------------------------------------------------------- B4 sales (INV-2 AR, INV-3, INV-6)


async def _random_sales(client, owner, bid, income, bank, customers, rng) -> None:
    """Invoices, receipts (named and Automatic, some overpaying), credit notes, late fees; some voided."""
    invoices = []
    for _ in range(6):
        customer = rng.choice(customers)
        amount = str(Decimal(rng.randint(100, 50_000)) / 100)
        body = {"date": DAY, "customer_id": customer, "post": True, "early_discount_rate": "2",
                "early_discount_days": 10, "lines": [{"account_id": income, "qty": "1", "unit_price": amount}]}
        response = await client.post(biz(bid, "/sales-invoices"), json=body, headers=owner.headers)
        assert response.status_code == 201, response.text
        invoices.append(response.json())
    ar = await system_account_id(client, owner, bid, "accounts_receivable")
    created = []
    for _ in range(6):
        invoice = rng.choice(invoices)
        amount = str(Decimal(rng.randint(100, 60_000)) / 100)
        kind = rng.choice(["receipts", "credit-notes", "late-payment-fees"])
        if kind == "receipts":
            line = {"account_id": ar, "party_id": invoice["customer_id"], "unit_price": amount,
                    "invoice_id": rng.choice([invoice["id"], None])}
            body = {"date": DAY, "bank_account_id": bank, "post": True, "lines": [line]}
        elif kind == "credit-notes":
            body = {"date": DAY, "customer_id": invoice["customer_id"], "post": True,
                    "invoice_id": rng.choice([invoice["id"], None]),
                    "lines": [{"account_id": income, "unit_price": amount}]}
        else:
            body = {"date": DAY, "customer_id": invoice["customer_id"], "invoice_id": invoice["id"],
                    "amount": amount, "post": True}
        response = await client.post(biz(bid, f"/{kind}"), json=body, headers=owner.headers)
        assert response.status_code == 201, response.text
        created.append((kind, response.json()))
    for kind, doc in rng.sample(created, 2):
        await client.post(biz(bid, f"/{kind}/{doc['id']}/void"), json={"version": doc["version"]},
                          headers=owner.headers)


@pytest.mark.parametrize("seed", [5, 23])
async def test_receivable_equals_sum_of_customers(client, books, db_conn, seed):
    """INV-2: Accounts receivable = Σ customers' AR balances; INV-3: no invoice balance below 0;
    every AR line carries its customer; INV-1 the business balances."""
    owner, bid, (income, *_) = books
    bank = (await create_bank_account(client, owner, bid))["id"]
    customers = [(await client.post(biz(bid, "/customers"), json={"name": f"Customer {i}"},
                                    headers=owner.headers)).json()["id"] for i in range(3)]
    await _random_sales(client, owner, bid, income, bank, customers, random.Random(seed))
    ar = await system_account_id(client, owner, bid, "accounts_receivable")
    control = await _scalar(db_conn, "SELECT COALESCE(sum(debit - credit), 0) FROM public.journal_lines"
                            " WHERE business_id = CAST(:b AS uuid) AND account_id = CAST(:a AS uuid)", b=bid, a=ar)
    listed = (await client.get(biz(bid, "/customers"), headers=owner.headers)).json()
    each = sum((Decimal(x["ar_balance"]) for x in listed["items"]), Decimal(0))
    without_party = await _scalar(db_conn, "SELECT count(*) FROM public.journal_lines WHERE business_id = CAST(:b AS uuid)"
                                  " AND account_id = CAST(:a AS uuid) AND party_id IS NULL", b=bid, a=ar)
    invoices = (await client.get(biz(bid, "/sales-invoices"), headers=owner.headers)).json()["items"]
    business_net = await _scalar(db_conn, "SELECT COALESCE(sum(debit - credit), 0) FROM public.journal_lines"
                                 " WHERE business_id = CAST(:b AS uuid)", b=bid)
    assert control == each == Decimal(listed["total_ar_balance"])
    assert without_party == 0 and business_net == 0
    assert all(Decimal(x["balance_due"]) >= 0 for x in invoices if x["balance_due"] is not None)


# ---------------------------------------------------------------- B5 purchases (INV-2 AP, INV-3)


async def _random_purchases(client, owner, bid, expense, bank, suppliers, rng) -> None:
    """Purchase invoices (one closed), payments (named and Automatic, some overpaying), debit notes; some voided."""
    invoices = []
    for _ in range(5):
        amount = str(Decimal(rng.randint(100, 50_000)) / 100)
        body = {"date": DAY, "supplier_id": rng.choice(suppliers), "post": True,
                "lines": [{"account_id": expense, "qty": "1", "unit_price": amount}]}
        response = await client.post(biz(bid, "/purchase-invoices"), json=body, headers=owner.headers)
        assert response.status_code == 201, response.text
        invoices.append(response.json())
    closed = invoices[0]
    response = await client.put(biz(bid, f"/purchase-invoices/{closed['id']}"), headers=owner.headers, json={
        "version": closed["version"], "date": DAY, "supplier_id": closed["supplier_id"], "is_closed": True,
        "lines": [{"account_id": expense, "qty": "1", "unit_price": closed["total"]}]})
    assert response.status_code == 200, response.text
    ap = await system_account_id(client, owner, bid, "accounts_payable")
    created = []
    for _ in range(6):
        invoice = rng.choice(invoices[1:])
        amount = str(Decimal(rng.randint(100, 60_000)) / 100)
        kind = rng.choice(["payments", "debit-notes"])
        if kind == "payments":
            line = {"account_id": ap, "party_id": invoice["supplier_id"], "unit_price": amount,
                    "invoice_id": rng.choice([invoice["id"], None])}
            body = {"date": DAY, "bank_account_id": bank, "post": True, "lines": [line]}
        else:
            body = {"date": DAY, "supplier_id": invoice["supplier_id"], "post": True,
                    "invoice_id": rng.choice([invoice["id"], None]),
                    "lines": [{"account_id": expense, "unit_price": amount}]}
        response = await client.post(biz(bid, f"/{kind}"), json=body, headers=owner.headers)
        assert response.status_code == 201, response.text
        created.append((kind, response.json()))
    for kind, doc in rng.sample(created, 2):
        await client.post(biz(bid, f"/{kind}/{doc['id']}/void"), json={"version": doc["version"]},
                          headers=owner.headers)


@pytest.mark.parametrize("seed", [7, 31])
async def test_payable_equals_sum_of_suppliers(client, books, db_conn, seed):
    """INV-2: Accounts payable = Σ suppliers' AP balances; INV-3: no purchase invoice below 0; a
    closed invoice is never allocated (PR-41c); every AP line carries its supplier."""
    owner, bid, (_, expense, *_) = books
    bank = (await create_bank_account(client, owner, bid))["id"]
    suppliers = [(await client.post(biz(bid, "/suppliers"), json={"name": f"Supplier {i}"},
                                    headers=owner.headers)).json()["id"] for i in range(3)]
    await _random_purchases(client, owner, bid, expense, bank, suppliers, random.Random(seed))
    ap = await system_account_id(client, owner, bid, "accounts_payable")
    control = await _scalar(db_conn, "SELECT COALESCE(sum(credit - debit), 0) FROM public.journal_lines"
                            " WHERE business_id = CAST(:b AS uuid) AND account_id = CAST(:a AS uuid)", b=bid, a=ap)
    listed = (await client.get(biz(bid, "/suppliers"), headers=owner.headers)).json()
    each = sum((Decimal(x["ap_balance"]) for x in listed["items"]), Decimal(0))
    without_party = await _scalar(db_conn, "SELECT count(*) FROM public.journal_lines WHERE business_id = CAST(:b AS uuid)"
                                  " AND account_id = CAST(:a AS uuid) AND party_id IS NULL", b=bid, a=ap)
    invoices = (await client.get(biz(bid, "/purchase-invoices"), headers=owner.headers)).json()["items"]
    closed = [x for x in invoices if x["is_closed"]]
    assert control == each == Decimal(listed["total_ap_balance"])
    assert without_party == 0
    assert all(Decimal(x["balance_due"]) >= 0 for x in invoices)
    assert len(closed) == 1 and closed[0]["balance_due"] == closed[0]["total"]
    assert invoices[-1]["is_closed"]  # sorted to the bottom of the list (PR-41c)


async def _random_stock(client, owner, bid, items, supplier, customer, rng) -> None:
    """Purchases (some back-dated), sales, write-offs and voids of inventory items (B6); a sale or write-off
    that would take stock below zero is rejected (409) and changes nothing."""
    posted = []
    for _ in range(14):
        item, day = rng.choice(items), f"2026-05-{rng.randint(1, 28):02}"
        qty, kind = str(rng.randint(1, 6)), rng.choice(["purchase-invoices", "sales-invoices", "inventory-write-offs"])
        line = {"item_id": item, "qty": qty}
        if kind == "purchase-invoices":
            body = {"date": day, "supplier_id": supplier, "lines": [{**line, "unit_price": str(rng.randint(5, 90))}]}
        elif kind == "sales-invoices":
            body = {"date": day, "customer_id": customer, "lines": [{**line, "unit_price": "100"}]}
        else:
            body = {"date": day, "lines": [line]}
        response = await client.post(biz(bid, f"/{kind}"), json={**body, "post": True}, headers=owner.headers)
        assert response.status_code in (201, 409), response.text
        if response.status_code == 201:
            posted.append((kind, response.json()))
    for kind, doc in rng.sample(posted, min(2, len(posted))):
        response = await client.post(biz(bid, f"/{kind}/{doc['id']}/void"), json={"version": doc["version"]},
                                     headers=owner.headers)
        assert response.status_code in (200, 409), response.text


@pytest.mark.parametrize("seed", [2, 11, 29])
async def test_inventory_gl_equals_stock_valuation(client, books, db_conn, seed):
    """INV-4: Inventory on hand per item in the GL = Σ stock movement values; owned qty never negative."""
    owner, bid, _ = books
    items = [(await client.post(biz(bid, "/inventory-items"), json={"name": f"Item {i}"},
                                headers=owner.headers)).json()["id"] for i in range(2)]
    supplier = (await client.post(biz(bid, "/suppliers"), json={"name": "S"}, headers=owner.headers)).json()["id"]
    customer = (await client.post(biz(bid, "/customers"), json={"name": "C"}, headers=owner.headers)).json()["id"]
    await _random_stock(client, owner, bid, items, supplier, customer, random.Random(seed))
    on_hand = await system_account_id(client, owner, bid, "inventory_on_hand")
    for item in items:
        gl = await _scalar(db_conn, "SELECT COALESCE(sum(debit - credit), 0) FROM public.journal_lines"
                           " WHERE business_id = CAST(:b AS uuid) AND account_id = CAST(:a AS uuid)"
                           " AND item_id = CAST(:i AS uuid)", b=bid, a=on_hand, i=item)
        value, qty = (await db_conn.execute(text(
            "SELECT COALESCE(sum(amount), 0), COALESCE(sum(qty_owned), 0) FROM public.stock_movements"
            " WHERE business_id = CAST(:b AS uuid) AND item_id = CAST(:i AS uuid)"), {"b": bid, "i": item})).one()
        assert (gl, qty >= 0, value >= 0) == (value, True, True)
