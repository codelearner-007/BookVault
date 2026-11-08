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

from app.db import session as db_session
from app.main import app
from tests.conftest import CSRF_HEADER, _add_idempotency_key
from tests.support.factories import create_business
from tests.support.ledger import biz, create_account, journal, post_je, set_lock_date, trial_balance

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

@pytest.fixture
async def live_client():
    """The app with its real session dependency (commits before the response, B1 race fix)."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test",
        headers={CSRF_HEADER: "web"}, event_hooks={"request": [_add_idempotency_key]},
    ) as http:
        yield http
    await db_session.get_session_manager().close()
    db_session._session_manager = None


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
        business = await probe.post("/api/v1/businesses", json={"name": "Race"}, headers=owner.headers)
    assert business.status_code == 201 and seen_at_response_start == [1]
    bid = business.json()["id"]
    a = await create_account(live_client, owner, bid, "Race A")
    b = await create_account(live_client, owner, bid, "Race B")
    entry = await post_je(live_client, owner, bid, DAY, [(a, "2", "0"), (b, "0", "2")])
    assert entry.status_code == 201
    assert (await journal(live_client, owner, bid, entry.json()["id"]))["entries"]
