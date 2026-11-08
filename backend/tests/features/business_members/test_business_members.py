"""Business members: owner-only management, owner row, removal, my access (B0.3; AC-06, AC-07, AC-10, AC-12)."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from tests.support.factories import add_member, create_business, put_access

V, C, E, D = "view", "create", "edit", "delete"


async def _owner_with_member(client, users, areas=None, mode="custom"):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    member = await users.create_member(owner, business_id)
    row = await add_member(client, owner, business_id, member, mode, areas)
    return owner, business_id, member, row


async def test_owner_lists_members_including_own_row(client, users):
    owner, business_id, member, _ = await _owner_with_member(client, users)

    listed = await client.get(f"/api/v1/businesses/{business_id}/members", headers=owner.headers)

    body = listed.json()
    assert (body["total"], body["page"]) == (2, 1)
    assert {(m["user_id"], m["is_owner"], m["access_mode"]) for m in body["items"]} == {
        (owner.id, True, "full"), (member.id, False, "custom")}


async def test_only_owner_manages_members(client, users):
    grid = [{"area_key": "receipts", "rights": [V, C, E, D]}]
    owner, business_id, member, row = await _owner_with_member(client, users, grid)
    base = f"/api/v1/businesses/{business_id}/members"

    calls = [
        await client.get(base, headers=member.headers),
        await client.post(base, json={"user_id": member.id}, headers=member.headers),
        await client.patch(f"{base}/{row['id']}", json={"status": "disabled", "version": 1}, headers=member.headers),
        await client.delete(f"{base}/{row['id']}", headers=member.headers),
        await client.put(f"{base}/{row['id']}/access", json={"access_mode": "full", "version": 1},
                         headers=member.headers),
    ]

    assert [c.status_code for c in calls] == [403] * 5


async def test_full_access_member_cannot_manage_members(client, users):
    owner, business_id, member, row = await _owner_with_member(client, users, mode="full")

    put = await client.put(f"/api/v1/businesses/{business_id}/members/{row['id']}/access",
                           json={"access_mode": "full", "version": 1}, headers=member.headers)
    delete = await client.delete(f"/api/v1/businesses/{business_id}", headers=member.headers)

    assert (put.status_code, delete.status_code) == (403, 403)


async def test_owner_member_row_cannot_be_removed_or_downgraded(client, users, db_conn):
    owner, business_id, _, _ = await _owner_with_member(client, users)
    rows = await client.get(f"/api/v1/businesses/{business_id}/members", headers=owner.headers)
    own = next(m for m in rows.json()["items"] if m["is_owner"])
    base = f"/api/v1/businesses/{business_id}/members/{own['id']}"

    removed = await client.delete(base, headers=owner.headers)
    downgraded = await put_access(client, owner, business_id, own, areas=[])
    disabled = await client.patch(base, json={"status": "disabled", "version": own["version"]},
                                  headers=owner.headers)
    async with db_conn.begin_nested() as savepoint:
        with pytest.raises(DBAPIError):
            await db_conn.execute(text(
                "UPDATE business_members SET access_mode = 'custom' WHERE id = CAST(:id AS uuid)"
            ), {"id": own["id"]})
        await savepoint.rollback()

    assert [removed.status_code, downgraded.status_code, disabled.status_code] == [403, 403, 403]


async def test_area_access_row_from_other_business_rejected(client, users, db_conn):
    _, business_a, _, row_a = await _owner_with_member(client, users)
    other = await users.create()
    business_b = (await create_business(client, other, "Other"))["id"]

    async with db_conn.begin_nested() as savepoint:
        with pytest.raises(DBAPIError):
            await db_conn.execute(text(
                "INSERT INTO business_member_area_access VALUES"
                " (CAST(:b AS uuid), CAST(:m AS uuid), 'receipts', 'view')"
            ), {"b": business_b, "m": row_a["id"]})
        await savepoint.rollback()


@pytest.mark.parametrize("how", ["removed", "disabled"])
async def test_removed_member_gets_404(client, users, how):
    owner, business_id, member, row = await _owner_with_member(
        client, users, [{"area_key": "receipts", "rights": [V]}])
    url = f"/api/v1/businesses/{business_id}/receipts"
    before = await client.get(url, headers=member.headers)

    member_url = f"/api/v1/businesses/{business_id}/members/{row['id']}"
    if how == "removed":
        await client.delete(member_url, headers=owner.headers)
    else:
        await client.patch(member_url, json={"status": "disabled", "version": row["version"]},
                           headers=owner.headers)
    after = await client.get(url, headers=member.headers)

    assert (before.status_code, after.status_code) == (200, 404)


async def test_removed_member_blocked_immediately(client, users):
    owner, business_id, member, row = await _owner_with_member(client, users, mode="full")

    await client.delete(f"/api/v1/businesses/{business_id}/members/{row['id']}", headers=owner.headers)
    responses = [await client.get(f"/api/v1/businesses/{business_id}{p}", headers=member.headers)
                 for p in ("", "/me", "/receipts", "/tabs")]
    listed = await client.get("/api/v1/me/businesses", headers=member.headers)

    assert [r.status_code for r in responses] == [404] * 4
    assert listed.json()["total"] == 0


async def test_identical_404_for_non_member_removed_and_unknown(client, users):
    owner, business_id, member, row = await _owner_with_member(client, users)
    stranger = await users.create()
    await client.delete(f"/api/v1/businesses/{business_id}/members/{row['id']}", headers=owner.headers)
    unknown = "0190f1d2-0000-7000-8000-00000000ffff"

    bodies = [
        (await client.get(f"/api/v1/businesses/{business_id}/receipts", headers=stranger.headers)).json(),
        (await client.get(f"/api/v1/businesses/{business_id}/receipts", headers=member.headers)).json(),
        (await client.get(f"/api/v1/businesses/{unknown}/receipts", headers=owner.headers)).json(),
    ]

    assert bodies[0] == bodies[1] == bodies[2]


async def test_member_sees_member_of_business_and_my_rights(client, users):
    grid = [{"area_key": "receipts", "rights": [C]}, {"area_key": "summary", "rights": [V]}]
    owner, business_id, member, _ = await _owner_with_member(client, users, grid)

    listed = await client.get("/api/v1/businesses", headers=member.headers)
    me = await client.get(f"/api/v1/businesses/{business_id}/me", headers=member.headers)
    tabs = await client.get(f"/api/v1/businesses/{business_id}/tabs", headers=member.headers)

    assert [(b["id"], b["is_owner"]) for b in listed.json()["items"]] == [(business_id, False)]
    assert me.json()["areas"] == [{"area_key": "summary", "rights": [V]},
                                  {"area_key": "receipts", "rights": [V, C]}]
    assert {t["key"] for t in tabs.json()["items"]} <= {"summary", "receipt"}


async def test_member_cannot_create_business(client, users):
    _, _, member, _ = await _owner_with_member(client, users, mode="full")

    response = await client.post("/api/v1/businesses", json={"name": "Mine"}, headers=member.headers)

    assert response.status_code == 403


async def test_owner_adds_own_created_user_to_second_business(client, users):
    owner, _, member, _ = await _owner_with_member(client, users)
    second = (await create_business(client, owner, "Second"))["id"]

    added = await add_member(client, owner, second, member, "custom",
                             [{"area_key": "customers", "rights": [V]}])
    listed = await client.get("/api/v1/me/businesses", headers=member.headers)

    assert added["user_id"] == member.id
    assert listed.json()["total"] == 2


async def test_owner_cannot_add_user_created_by_someone_else(client, users):
    _, _, member, _ = await _owner_with_member(client, users)
    other = await users.create()
    business = (await create_business(client, other, "Other"))["id"]
    admin_account = await users.create()

    calls = [
        await client.post(f"/api/v1/businesses/{business}/members", json={"user_id": uid},
                          headers=other.headers)
        for uid in (member.id, admin_account.id, other.id)
    ]

    assert [c.status_code for c in calls] == [404, 404, 404]


async def test_member_belongs_only_to_creator_businesses(client, users, db_conn):
    await _owner_with_member(client, users)
    await _owner_with_member(client, users, mode="full")

    stray = await db_conn.execute(text(
        "SELECT count(*) FROM business_members bm"
        " JOIN businesses b ON b.id = bm.business_id"
        " JOIN user_profiles p ON p.user_id = bm.user_id"
        " JOIN user_roles ur ON ur.user_id = bm.user_id JOIN roles r ON r.id = ur.role_id"
        " WHERE r.name = 'member' AND b.owner_id IS DISTINCT FROM p.created_by_user_id"
    ))

    assert stray.scalar() == 0
