"""Baseline: per-business list column preferences (feature #11)."""

from tests.support.factories import create_business


async def test_tab_columns_save_and_read(client, users):
    owner = await users.create()
    business = await create_business(client, owner)
    url = f"/api/v1/businesses/{business['id']}/tab-columns/customers"
    columns = [
        {"col_key": "name", "visible": True, "order_index": 0},
        {"col_key": "email", "visible": False, "order_index": 1},
    ]

    saved = await client.put(url, json={"columns": columns}, headers=owner.headers)
    read = await client.get(url, headers=owner.headers)

    assert saved.status_code == 200, saved.text
    assert read.json()["columns"] == columns
