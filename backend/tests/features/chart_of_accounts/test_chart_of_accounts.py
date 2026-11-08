"""Baseline: COA seed, CRUD, reorder, system-row protection (feature #12)."""

from tests.support.factories import create_business


def _url(business_id: str, part: str) -> str:
    return f"/api/v1/businesses/{business_id}/chart-of-accounts/{part}"


async def _root_id(client, owner, business_id: str, root_key: str) -> str:
    groups = (await client.get(_url(business_id, "groups?page_size=100"), headers=owner.headers)).json()
    return next(g["id"] for g in groups["items"] if g["root_key"] == root_key)


async def test_coa_seeded_on_business_create(client, users):
    owner = await users.create()
    business = await create_business(client, owner)

    groups = await client.get(_url(business["id"], "groups"), headers=owner.headers)
    accounts = await client.get(_url(business["id"], "accounts"), headers=owner.headers)

    assert groups.json()["total"] > 0
    assert accounts.json()["total"] > 0


async def test_coa_group_and_account_crud(client, users):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]

    group = await client.post(
        _url(business_id, "groups"),
        json={"name": "Assets X", "type": "balance_sheet",
              "parent_group_id": await _root_id(client, owner, business_id, "assets")},
        headers=owner.headers,
    )
    account = await client.post(
        _url(business_id, "accounts"),
        json={"name": "Petty", "type": "asset", "group_id": group.json()["id"]},
        headers=owner.headers,
    )
    account_url = _url(business_id, f"accounts/{account.json()['id']}")
    renamed = await client.put(
        account_url, json={"name": "Petty cash", "version": account.json()["version"]},
        headers=owner.headers,
    )
    removed = await client.delete(
        account_url, params={"version": renamed.json()["version"]}, headers=owner.headers
    )

    assert group.status_code == 201, group.text
    assert account.json()["group_id"] == group.json()["id"]
    assert renamed.json()["name"] == "Petty cash"
    assert removed.status_code in {200, 204}


async def test_coa_reorder_accounts(client, users):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    group = (
        await client.post(
            _url(business_id, "groups"), headers=owner.headers,
            json={"name": "G", "type": "pl", "parent_group_id": await _root_id(client, owner, business_id, "income")},
        )
    ).json()
    ids = []
    for name in ("One", "Two"):
        created = await client.post(
            _url(business_id, "accounts"),
            json={"name": name, "group_id": group["id"]},
            headers=owner.headers,
        )
        ids.append(created.json()["id"])

    reordered = await client.put(
        _url(business_id, "accounts/order"),
        json={"group_id": group["id"], "items": list(reversed(ids))},
        headers=owner.headers,
    )

    assert reordered.status_code in {200, 204}, reordered.text


async def test_coa_system_rows_are_protected(client, users):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    accounts = (await client.get(_url(business_id, "accounts"), headers=owner.headers)).json()
    system = next(a for a in accounts["items"] if a["is_system"])

    response = await client.delete(
        _url(business_id, f"accounts/{system['id']}"), params={"version": system["version"]},
        headers=owner.headers,
    )

    assert response.status_code == 403
