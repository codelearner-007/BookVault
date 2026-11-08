"""Baseline: receipts CRUD with resolved names, and the suspense balance (features #16, #17)."""

from tests.support.factories import create_bank_account, create_business, first_coa_account_id

SUSPENSE_LINE = {"account_id": "suspense", "amount": 40, "total": 40}


async def test_receipts_crud_with_names(client, users):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    base = f"/api/v1/businesses/{business_id}/receipts"
    account = await create_bank_account(client, owner, business_id)
    coa_id = await first_coa_account_id(client, owner, business_id)

    created = await client.post(
        base,
        json={
            "date": "2026-11-08",
            "reference": "R-1",
            "received_in_account_id": account["id"],
            "lines": [{"account_id": coa_id, "amount": 10, "total": 10}],
        },
        headers=owner.headers,
    )
    receipt_id = created.json()["id"]
    updated = await client.put(f"{base}/{receipt_id}", json={"reference": "R-2"}, headers=owner.headers)
    listed = await client.get(base, headers=owner.headers)
    removed = await client.delete(f"{base}/{receipt_id}", headers=owner.headers)

    assert created.status_code == 201, created.text
    assert created.json()["received_in_account_name"] == account["name"]
    assert created.json()["lines"][0]["account_name"]
    assert updated.json()["reference"] == "R-2"
    assert listed.json()["total"] == 1
    assert removed.status_code == 204


async def test_suspense_balance_and_entries(client, users):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    await client.post(
        f"/api/v1/businesses/{business_id}/receipts",
        json={"date": "2026-11-08", "paid_by_type": "Other", "lines": [SUSPENSE_LINE]},
        headers=owner.headers,
    )

    balance = await client.get(
        f"/api/v1/businesses/{business_id}/suspense/balance", headers=owner.headers
    )
    entries = await client.get(
        f"/api/v1/businesses/{business_id}/suspense/entries", headers=owner.headers
    )

    assert balance.json()["suspense_balance"] == 40.0
    assert entries.json()["total"] == 1
