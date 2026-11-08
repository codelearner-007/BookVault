"""Baseline: business tabs + Customize, super-admin Features catalog (feature #10)."""

from tests.support.factories import create_business


async def test_business_tabs_list_and_customize(client, users):
    owner = await users.create()
    business = await create_business(client, owner)
    url = f"/api/v1/businesses/{business['id']}/tabs"

    tabs = (await client.get(url, headers=owner.headers)).json()["items"]
    assert tabs, "a new business gets the catalog tabs"
    first = tabs[0]
    toggled = await client.put(
        url,
        json={"items": [{"key": first["key"], "enabled": not first["enabled"]}]},
        headers=owner.headers,
    )

    assert toggled.status_code == 200, toggled.text
    after = {t["key"]: t["enabled"] for t in toggled.json()["items"]}
    assert after[first["key"]] is (not first["enabled"])


async def test_admin_tabs_catalog_super_admin(client, users):
    super_admin = await users.create("super_admin")

    response = await client.get("/api/v1/admin-tabs", headers=super_admin.headers)

    assert response.status_code == 200, response.text
    assert {t["key"] for t in response.json()["items"]} >= {"customers", "suppliers"}
