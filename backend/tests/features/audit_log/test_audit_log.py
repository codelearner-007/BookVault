"""Baseline: audit rows are written and the viewer lists only the caller's own (feature #5)."""

from tests.support.factories import create_bank_account, create_business


async def test_audit_log_lists_own_actions(client, users):
    owner, other = await users.create(), await users.create()
    business_id = (await create_business(client, owner))["id"]
    await create_bank_account(client, owner, business_id)
    await create_business(client, other)

    response = await client.get("/api/v1/audit/logs", headers=owner.headers)

    body = response.json()
    assert response.status_code == 200, response.text
    assert body["total"] >= 1
    assert {log["user_id"] for log in body["items"]} == {owner.id}


async def test_audit_log_is_paginated(client, users):
    owner = await users.create()

    response = await client.get("/api/v1/audit/logs?page_size=101", headers=owner.headers)

    assert response.status_code == 422
