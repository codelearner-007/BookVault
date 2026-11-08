"""Baseline: customers (feature #14) and suppliers (feature #15) share one contract."""

import pytest

from tests.support.factories import create_bank_account, create_business, create_contact, receipt_body
from tests.support.ledger import create_account

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


@pytest.mark.parametrize(("kind", "contact_type"), [("customers", "customer"), ("suppliers", "supplier")])
async def test_contact_receipts_list(client, users, kind, contact_type):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    contact = await create_contact(client, owner, business_id, kind)
    bank = await create_bank_account(client, owner, business_id)
    income = await create_account(client, owner, business_id, "Service income", "income")
    created = await client.post(
        f"/api/v1/businesses/{business_id}/receipts",
        json=receipt_body(bank["id"], [(income, "3")], counterparty_party_id=contact["id"]),
        headers=owner.headers,
    )
    assert created.status_code == 201, created.text

    receipts = await client.get(
        f"/api/v1/businesses/{business_id}/{kind}/{contact['id']}/receipts", headers=owner.headers
    )

    assert receipts.json()["total"] == 1
