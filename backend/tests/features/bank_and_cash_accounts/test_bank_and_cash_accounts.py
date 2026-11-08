"""Baseline: bank/cash accounts CRUD and balance after receipts (feature #13)."""

from decimal import Decimal

from tests.support.factories import create_bank_account, create_business


async def test_bank_accounts_crud(client, users):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    base = f"/api/v1/businesses/{business_id}/bank-accounts"

    account = await create_bank_account(client, owner, business_id, "50.00")
    renamed = await client.put(
        f"{base}/{account['id']}", json={"name": "Renamed", "version": account["version"]},
        headers=owner.headers,
    )
    listed = await client.get(base, headers=owner.headers)
    removed = await client.delete(
        f"{base}/{account['id']}", params={"version": renamed.json()["version"]}, headers=owner.headers
    )

    assert renamed.json()["name"] == "Renamed"
    assert listed.json()["total"] == 1
    assert removed.status_code == 204


async def test_bank_account_balance_after_receipts(client, users):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    account = await create_bank_account(client, owner, business_id, "100.00")
    lines = [{"account_id": "suspense", "amount": 25, "total": 25}]

    receipt = await client.post(
        f"/api/v1/businesses/{business_id}/receipts",
        json={"date": "2026-11-08", "received_in_account_id": account["id"], "lines": lines},
        headers=owner.headers,
    )
    fetched = await client.get(
        f"/api/v1/businesses/{business_id}/bank-accounts/{account['id']}", headers=owner.headers
    )

    assert receipt.status_code == 201, receipt.text
    assert Decimal(fetched.json()["current_balance"]) == Decimal("125.00")
