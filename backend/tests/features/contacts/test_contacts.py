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
        f"{base}/{contact['id']}", json={"email": "c@bookvault-test.dev"}, headers=owner.headers
    )
    listed = await client.get(base, headers=owner.headers)
    removed = await client.delete(f"{base}/{contact['id']}", headers=owner.headers)

    assert updated.json()["email"] == "c@bookvault-test.dev"
    assert listed.json()["total"] == 1
    assert removed.status_code == 204


@pytest.mark.parametrize(("kind", "contact_type"), [("customers", "customer"), ("suppliers", "supplier")])
async def test_contact_receipts_list(client, users, kind, contact_type):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    contact = await create_contact(client, owner, business_id, kind)
    await client.post(
        f"/api/v1/businesses/{business_id}/receipts",
        json={
            "date": "2026-11-08",
            "paid_by_contact_id": contact["id"],
            "paid_by_contact_type": contact_type,
        },
        headers=owner.headers,
    )

    receipts = await client.get(
        f"/api/v1/businesses/{business_id}/{kind}/{contact['id']}/receipts", headers=owner.headers
    )

    assert receipts.json()["total"] == 1
