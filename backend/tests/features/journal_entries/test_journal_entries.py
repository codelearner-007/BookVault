"""Manual Journal Entries and the posting service through the API (build-plan B1)."""

from decimal import Decimal

import pytest
from sqlalchemy import text

from tests.support.factories import add_member, create_business
from tests.support.ledger import biz, create_account, je_body, journal, post_je, set_lock_date, trial_balance

DAY = "2026-04-10"


@pytest.fixture
async def books(client, users):
    """An owner, a business and two expense-side accounts."""
    owner = await users.create("admin")
    business = await create_business(client, owner)
    bid = business["id"]
    rent = await create_account(client, owner, bid, "Rent")
    charges = await create_account(client, owner, bid, "Bank charges")
    return owner, bid, rent, charges


async def _ledger_line_count(db_conn, business_id: str) -> int:
    result = await db_conn.execute(
        text("SELECT count(*) FROM public.journal_lines WHERE business_id = CAST(:b AS uuid)"),
        {"b": business_id},
    )
    return result.scalar_one()


async def _put(client, owner, bid, doc, **changes):
    body = {"version": doc["version"], "date": doc["date"], "reference": doc["reference"],
            "description": doc["description"],
            "lines": [{"account_id": x["account_id"], "debit": x["debit"], "credit": x["credit"],
                       "description": x["description"]} for x in doc["lines"]]}
    body.update(changes)
    return await client.put(biz(bid, f"/journal-entries/{doc['id']}"), json=body, headers=owner.headers)


async def test_draft_journal_entry_has_no_journal_lines(client, books, db_conn):
    owner, bid, rent, charges = books
    response = await post_je(client, owner, bid, DAY, [(rent, "10", "0"), (charges, "0", "10")], post=False)
    assert response.status_code == 201 and response.json()["status"] == "draft"
    assert await _ledger_line_count(db_conn, bid) == 0
    assert (await journal(client, owner, bid, response.json()["id"]))["entries"] == []


async def test_draft_may_be_unbalanced_but_post_rejects_it(client, books, db_conn):
    owner, bid, rent, _ = books
    draft = (await post_je(client, owner, bid, DAY, [(rent, "50", "0")], post=False)).json()
    assert draft["difference"] == "50.00"
    response = await client.post(biz(bid, f"/journal-entries/{draft['id']}/post"),
                                 json={"version": draft["version"]}, headers=owner.headers)
    assert response.status_code == 422 and response.json()["details"]["code"] == "journal_unbalanced"
    assert await _ledger_line_count(db_conn, bid) == 0


async def test_post_copies_document_lines_into_journal_lines(client, books, db_conn):
    owner, bid, rent, charges = books
    draft = (await post_je(client, owner, bid, DAY, [(rent, "12.5", "0"), (charges, "0", "12.5")],
                           post=False)).json()
    posted = await client.post(biz(bid, f"/journal-entries/{draft['id']}/post"),
                               json={"version": draft["version"]}, headers=owner.headers)
    assert posted.status_code == 200 and posted.json()["status"] == "posted"
    rows = (await db_conn.execute(text(
        "SELECT l.document_line_id::text, l.account_id::text, l.debit, l.credit"
        " FROM public.journal_lines l WHERE l.business_id = CAST(:b AS uuid) ORDER BY l.line_no"
    ), {"b": bid})).all()
    assert [(r[0], r[1], r[2], r[3]) for r in rows] == [
        (x["id"], x["account_id"], Decimal(x["debit"]), Decimal(x["credit"])) for x in draft["lines"]
    ]


async def test_void_draft_discards_without_ledger_effect(client, books, db_conn):
    owner, bid, rent, charges = books
    draft = (await post_je(client, owner, bid, DAY, [(rent, "5", "0"), (charges, "0", "5")], post=False)).json()
    voided = await client.post(biz(bid, f"/journal-entries/{draft['id']}/void"),
                               json={"version": draft["version"]}, headers=owner.headers)
    assert voided.status_code == 200 and voided.json()["status"] == "void"
    assert await _ledger_line_count(db_conn, bid) == 0


async def test_void_posted_entry_posts_exact_reversal(client, books):
    """PR-74 / INV-6: the reversal negates the entry; balances return to their prior values."""
    owner, bid, rent, charges = books
    doc = (await post_je(client, owner, bid, DAY, [(rent, "40", "0"), (charges, "0", "40")])).json()
    assert len((await trial_balance(client, owner, bid))["rows"]) == 2
    voided = await client.post(biz(bid, f"/journal-entries/{doc['id']}/void"),
                               json={"version": doc["version"]}, headers=owner.headers)
    assert voided.status_code == 200
    entries = (await journal(client, owner, bid, doc["id"]))["entries"]
    assert [e["source"] for e in entries] == ["document", "reversal"]
    assert entries[1]["reverses_entry_id"] == entries[0]["id"]
    original = {(x["account_id"], x["debit"], x["credit"]) for x in entries[0]["lines"]}
    assert {(x["account_id"], x["credit"], x["debit"]) for x in entries[1]["lines"]} == original
    assert (await trial_balance(client, owner, bid))["rows"] == []


async def test_edit_posted_entry_reverses_and_reposts(client, books):
    """PR-73: edit = reversal + new entry, version + 1; GL hides the reversed pair by default."""
    owner, bid, rent, charges = books
    doc = (await post_je(client, owner, bid, DAY, [(rent, "10", "0"), (charges, "0", "10")])).json()
    lines = [{"account_id": rent, "debit": "15", "credit": "0"},
             {"account_id": charges, "debit": "0", "credit": "15"}]
    edited = await _put(client, owner, bid, doc, lines=lines)
    assert edited.status_code == 200, edited.text
    assert edited.json()["version"] == doc["version"] + 1
    entries = (await journal(client, owner, bid, doc["id"]))["entries"]
    assert [e["source"] for e in entries] == ["document", "reversal", "document"]
    tb = await trial_balance(client, owner, bid)
    assert tb["total_debit"] == tb["total_credit"] == "15.00"
    gl = biz(bid, "/reports/general-ledger-transactions?from=2026-01-01&to=2026-12-31")
    visible = (await client.get(gl, headers=owner.headers)).json()
    everything = (await client.get(gl + "&include_reversed=true", headers=owner.headers)).json()
    assert visible["total"] == 2 and everything["total"] == 6


async def test_stale_version_edit_409(client, books):
    owner, bid, rent, charges = books
    doc = (await post_je(client, owner, bid, DAY, [(rent, "1", "0"), (charges, "0", "1")])).json()
    assert (await _put(client, owner, bid, doc, description="first")).status_code == 200
    stale = await _put(client, owner, bid, doc, description="second")
    assert stale.status_code == 409 and stale.json()["details"]["code"] == "version_conflict"


async def test_duplicate_post_same_key_one_entry(client, books):
    """AC-19: the same Idempotency-Key and body replays the response; one entry exists."""
    owner, bid, rent, charges = books
    headers = {**owner.headers, "Idempotency-Key": "je-once"}
    body = je_body(DAY, [(rent, "3", "0"), (charges, "0", "3")])
    first = await client.post(biz(bid, "/journal-entries"), json=body, headers=headers)
    second = await client.post(biz(bid, "/journal-entries"), json=body, headers=headers)
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    listing = (await client.get(biz(bid, "/journal-entries"), headers=owner.headers)).json()
    assert listing["total"] == 1


async def test_journal_entry_numbering_sequential(client, books):
    owner, bid, rent, charges = books
    refs = [(await post_je(client, owner, bid, DAY, [(rent, "1", "0"), (charges, "0", "1")],
                           post=False)).json()["reference"] for _ in range(3)]
    assert refs == ["1", "2", "3"]


async def test_lock_date_is_inclusive(client, books):
    """T96a + T96: dated on the lock date -> 409 period_locked; the day after -> posted."""
    owner, bid, rent, charges = books
    await set_lock_date(client, owner, bid, "2026-11-05")
    on_lock = await post_je(client, owner, bid, "2026-11-05", [(rent, "1", "0"), (charges, "0", "1")])
    assert on_lock.status_code == 409
    assert on_lock.json()["error"] == "Transactions dated on or before 2026-11-05 are locked."
    after = await post_je(client, owner, bid, "2026-11-06", [(rent, "1", "0"), (charges, "0", "1")])
    assert after.status_code == 201


async def test_locked_doc_description_and_attachments_editable(client, books):
    owner, bid, rent, charges = books
    doc = (await post_je(client, owner, bid, DAY, [(rent, "2", "0"), (charges, "0", "2")])).json()
    await set_lock_date(client, owner, bid, "2026-06-30")
    response = await _put(client, owner, bid, doc, description="Corrected memo")
    assert response.status_code == 200, response.text
    assert response.json()["description"] == "Corrected memo" and response.json()["is_locked"]
    assert len((await journal(client, owner, bid, doc["id"]))["entries"]) == 1


async def test_locked_doc_amount_date_account_edit_rejected(client, books):
    owner, bid, rent, charges = books
    doc = (await post_je(client, owner, bid, DAY, [(rent, "2", "0"), (charges, "0", "2")])).json()
    await set_lock_date(client, owner, bid, "2026-06-30")
    swapped = [{"account_id": charges, "debit": "2", "credit": "0"},
               {"account_id": rent, "debit": "0", "credit": "2"}]
    for changes in ({"lines": swapped}, {"date": "2026-07-15"}):
        response = await _put(client, owner, bid, doc, **changes)
        assert response.status_code == 409 and response.json()["details"]["code"] == "period_locked"
    void = await client.post(biz(bid, f"/journal-entries/{doc['id']}/void"),
                             json={"version": doc["version"]}, headers=owner.headers)
    assert void.status_code == 409


async def test_lock_date_change_is_audited(client, books, db_conn):
    """BUG-14: moving the lock earlier or removing it needs a reason; old/new are audited."""
    owner, bid, _, _ = books
    await set_lock_date(client, owner, bid, "2026-06-30")
    current = (await client.get(biz(bid, "/settings/books"), headers=owner.headers)).json()
    no_reason = await client.put(biz(bid, "/settings/books"), headers=owner.headers, json={
        "version": current["version"], "books_start_date": current["books_start_date"], "lock_date": None,
    })
    assert no_reason.status_code == 422 and no_reason.json()["details"]["code"] == "reason_required"
    await set_lock_date(client, owner, bid, "2026-01-31", reason="Correct January")
    row = (await db_conn.execute(text(
        "SELECT before->>'lock_date', after->>'lock_date', details->>'reason' FROM public.audit_logs"
        " WHERE business_id = CAST(:b AS uuid) AND entity_type = 'BookSettings'"
        " ORDER BY created_at DESC, id DESC LIMIT 1"
    ), {"b": bid})).one()
    assert tuple(row) == ("2026-06-30", "2026-01-31", "Correct January")


async def test_totals_endpoint_rounds_half_away_from_zero(client, books):
    owner, bid, _, _ = books
    response = await client.post(biz(bid, "/journal-entries/totals"), headers=owner.headers,
                                 json={"lines": [{"debit": "0.105"}, {"credit": "0.1"}]})
    assert response.json() == {"total_debit": "0.11", "total_credit": "0.10", "difference": "0.01"}


async def test_total_account_cannot_be_posted_to(client, books):
    owner, bid, rent, _ = books
    accounts = (await client.get(biz(bid, "/chart-of-accounts/accounts"), headers=owner.headers)).json()
    total_row = next(a["id"] for a in accounts["items"] if a["type"] == "total")
    response = await post_je(client, owner, bid, DAY, [(rent, "1", "0"), (total_row, "0", "1")])
    assert response.status_code == 422 and response.json()["details"]["code"] == "invalid_account"


async def test_void_needs_delete_right_not_edit(client, users, books):
    """D-39: void = delete. A member with view/create/edit cannot void; reports need reports view."""
    owner, bid, rent, charges = books
    doc = (await post_je(client, owner, bid, DAY, [(rent, "1", "0"), (charges, "0", "1")])).json()
    member = await users.create_member(owner, bid)
    await add_member(client, owner, bid, member, "custom",
                     [{"area_key": "journal_entries", "rights": ["view", "create", "edit"]}])
    void = await client.post(biz(bid, f"/journal-entries/{doc['id']}/void"),
                             json={"version": doc["version"]}, headers=member.headers)
    assert void.status_code == 403
    tb = await client.get(biz(bid, "/reports/trial-balance?as_at=2026-12-31"), headers=member.headers)
    assert tb.status_code == 403
    assert (await journal(client, member, bid, doc["id"]))["entries"]
