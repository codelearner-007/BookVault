"""Per-document History, Restore this version and Restore a deleted document (through the posting service)."""

import uuid

import pytest

from tests.support.factories import add_member, create_business
from tests.support.ledger import biz, create_account, post_je, set_lock_date, trial_balance

DAY = "2026-04-10"


@pytest.fixture
async def books(client, users):
    owner = await users.create("admin")
    business = await create_business(client, owner)
    bid = business["id"]
    rent = await create_account(client, owner, bid, "Rent")
    charges = await create_account(client, owner, bid, "Bank charges")
    return owner, bid, rent, charges


def _key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


async def _edit_amount(client, owner, bid, doc, amount: str) -> dict:
    lines = [{"account_id": x["account_id"], "debit": amount if x["debit"] != "0.00" else "0",
              "credit": amount if x["credit"] != "0.00" else "0", "description": x["description"]}
             for x in doc["lines"]]
    body = {"version": doc["version"], "date": doc["date"], "reference": doc["reference"],
            "description": doc["description"], "lines": lines}
    response = await client.put(biz(bid, f"/journal-entries/{doc['id']}"), json=body, headers=owner.headers)
    assert response.status_code == 200, response.text
    return response.json()


async def _history(client, user, bid, doc_id):
    return await client.get(biz(bid, f"/documents/{doc_id}/history"), headers=user.headers)


async def _restore(client, user, bid, doc_id, audit_id, version, headers=None):
    return await client.post(biz(bid, f"/documents/{doc_id}/restore-version"),
                             json={"audit_id": audit_id, "version": version},
                             headers={**user.headers, **(headers or _key())})


def _balances(tb) -> dict[str, tuple[str, str]]:
    return {row["account_name"]: (row["debit"], row["credit"]) for row in tb["rows"]}


async def test_history_lists_changes_newest_first(client, books):
    owner, bid, rent, charges = books
    doc = (await post_je(client, owner, bid, DAY, [(rent, "40", "0"), (charges, "0", "40")])).json()
    await _edit_amount(client, owner, bid, doc, "55")

    response = await _history(client, owner, bid, doc["id"])

    assert response.status_code == 200, response.text
    actions = [row["action"] for row in response.json()["items"]]
    assert actions == ["update", "create"]


async def test_restore_after_edit_brings_back_previous_ledger_amounts(client, books):
    owner, bid, rent, charges = books
    doc = (await post_je(client, owner, bid, DAY, [(rent, "40", "0"), (charges, "0", "40")])).json()
    before = _balances(await trial_balance(client, owner, bid))
    assert before["Rent"] == ("40.00", "0")
    edited = await _edit_amount(client, owner, bid, doc, "55")
    assert _balances(await trial_balance(client, owner, bid))["Rent"] == ("55.00", "0")
    created = (await _history(client, owner, bid, doc["id"])).json()["items"][-1]

    restored = await _restore(client, owner, bid, doc["id"], created["id"], edited["version"])

    assert restored.status_code == 200, restored.text
    assert restored.json()["version"] > edited["version"]
    assert _balances(await trial_balance(client, owner, bid)) == before
    actions = [row["action"] for row in (await _history(client, owner, bid, doc["id"])).json()["items"]]
    assert actions[0] == "restore"


async def test_restore_is_idempotent_per_key(client, books):
    owner, bid, rent, charges = books
    doc = (await post_je(client, owner, bid, DAY, [(rent, "40", "0"), (charges, "0", "40")])).json()
    edited = await _edit_amount(client, owner, bid, doc, "55")
    created = (await _history(client, owner, bid, doc["id"])).json()["items"][-1]
    key = _key()

    first = await _restore(client, owner, bid, doc["id"], created["id"], edited["version"], key)
    again = await _restore(client, owner, bid, doc["id"], created["id"], edited["version"], key)

    assert first.status_code == 200 and again.status_code == 200
    assert again.json()["version"] == first.json()["version"]


async def test_restore_of_deleted_document_reposts(client, books):
    owner, bid, rent, charges = books
    doc = (await post_je(client, owner, bid, DAY, [(rent, "40", "0"), (charges, "0", "40")])).json()
    before = _balances(await trial_balance(client, owner, bid))
    voided = (await client.post(biz(bid, f"/journal-entries/{doc['id']}/void"),
                                json={"version": doc["version"]}, headers=owner.headers)).json()
    assert _balances(await trial_balance(client, owner, bid)) != before

    restored = await client.post(biz(bid, f"/documents/{doc['id']}/restore"),
                                 json={"version": voided["version"]}, headers={**owner.headers, **_key()})

    assert restored.status_code == 200, restored.text
    assert restored.json()["status"] == "posted"
    assert _balances(await trial_balance(client, owner, bid)) == before


async def test_restore_respects_rights(client, users, books):
    owner, bid, rent, charges = books
    viewer = await users.create_member(owner, bid)
    await add_member(client, owner, bid, viewer, "custom", [{"area_key": "journal_entries", "rights": ["view"]}])
    doc = (await post_je(client, owner, bid, DAY, [(rent, "40", "0"), (charges, "0", "40")])).json()
    edited = await _edit_amount(client, owner, bid, doc, "55")
    created = (await _history(client, owner, bid, doc["id"])).json()["items"][-1]

    assert (await _history(client, viewer, bid, doc["id"])).status_code == 200
    refused = await _restore(client, viewer, bid, doc["id"], created["id"], edited["version"])
    assert refused.status_code == 403


async def test_restore_respects_lock_date(client, books):
    owner, bid, rent, charges = books
    doc = (await post_je(client, owner, bid, DAY, [(rent, "40", "0"), (charges, "0", "40")])).json()
    edited = await _edit_amount(client, owner, bid, doc, "55")
    created = (await _history(client, owner, bid, doc["id"])).json()["items"][-1]
    await set_lock_date(client, owner, bid, "2026-06-30")

    refused = await _restore(client, owner, bid, doc["id"], created["id"], edited["version"])

    assert refused.status_code == 409
    assert refused.json()["details"]["code"] == "period_locked"


async def test_other_business_document_is_404(client, users, books):
    owner, bid, rent, charges = books
    doc = (await post_je(client, owner, bid, DAY, [(rent, "40", "0"), (charges, "0", "40")])).json()
    stranger = await users.create("admin")
    other = await create_business(client, stranger)

    assert (await _history(client, stranger, other["id"], doc["id"])).status_code == 404
    assert (await _history(client, stranger, bid, doc["id"])).status_code == 404
