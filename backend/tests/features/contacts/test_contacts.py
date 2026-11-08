"""Baseline: customers (feature #14) and suppliers (feature #15) share one contract."""

import pytest

from tests.support.factories import create_business, create_contact

KINDS = ["customers", "suppliers"]


@pytest.mark.parametrize("kind", KINDS)
async def test_contacts_crud(client, users, kind):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    base = f"/api/v1/businesses/{business_id}/{kind}"

    contact = await create_contact(client, owner, business_id, kind)
    updated = await client.put(
        f"{base}/{contact['id']}",
        json={"email": "c@bookvault-test.dev", "version": contact["version"]},
        headers=owner.headers,
    )
    listed = await client.get(base, headers=owner.headers)
    removed = await client.delete(
        f"{base}/{contact['id']}", params={"version": updated.json()["version"]}, headers=owner.headers
    )

    assert updated.json()["email"] == "c@bookvault-test.dev"
    assert listed.json()["total"] == 1
    assert removed.status_code == 204


@pytest.mark.parametrize("kind", ["customers", "suppliers"])
async def test_contact_receipts_alias_removed(client, users, kind):
    """NA-10 (B5): /{kind}/{id}/receipts is gone; /transactions replaces it."""
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    contact = await create_contact(client, owner, business_id, kind)
    base = f"/api/v1/businesses/{business_id}/{kind}/{contact['id']}"
    assert (await client.get(f"{base}/receipts", headers=owner.headers)).status_code == 404
    assert (await client.get(f"{base}/transactions", headers=owner.headers)).json()["total"] == 0
