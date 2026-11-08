"""Baseline: businesses CRUD, soft delete, restore, reset (feature #9; permanent delete: tests/security/test_purge_business.py)."""

from tests.support.factories import create_business

BASE = "/api/v1/businesses"


async def test_businesses_create_list_get(client, users):
    owner = await users.create()
    business = await create_business(client, owner, "Acme")

    listed = await client.get(BASE, headers=owner.headers)
    fetched = await client.get(f"{BASE}/{business['id']}", headers=owner.headers)

    assert [b["id"] for b in listed.json()["items"]] == [business["id"]]
    assert fetched.json()["name"] == "Acme"


async def test_businesses_update_and_reset(client, users):
    owner = await users.create()
    business = await create_business(client, owner)
    countries = await client.get("/api/v1/countries", params={"search": "Pakistan"}, headers=owner.headers)
    pakistan = countries.json()["items"][0]["id"]

    updated = await client.put(
        f"{BASE}/{business['id']}",
        json={"name": "Renamed", "country_id": pakistan, "address": "Main St",
              "version": business["version"]},
        headers=owner.headers,
    )
    reset = await client.post(f"{BASE}/{business['id']}/reset", headers=owner.headers)

    assert updated.status_code == 200, updated.text
    assert (updated.json()["name"], updated.json()["address"], updated.json()["country"]) == (
        "Renamed", "Main St", "Pakistan")
    assert reset.status_code == 200, reset.text
    assert (reset.json()["country_id"], reset.json()["country"]) == (None, None)


async def test_businesses_soft_delete_restore(client, users):
    owner = await users.create()
    business = await create_business(client, owner)

    await client.delete(f"{BASE}/{business['id']}", headers=owner.headers)
    deleted = await client.get(f"{BASE}/deleted", headers=owner.headers)
    restored = await client.post(f"{BASE}/{business['id']}/restore", headers=owner.headers)
    active = await client.get(BASE, headers=owner.headers)

    assert [b["id"] for b in deleted.json()["items"]] == [business["id"]]
    assert restored.status_code == 200, restored.text
    assert [b["id"] for b in active.json()["items"]] == [business["id"]]


async def test_businesses_list_only_own(client, users):
    owner, other = await users.create(), await users.create()
    await create_business(client, other)

    listed = await client.get(BASE, headers=owner.headers)

    assert listed.json()["items"] == []
