"""Baseline: platform user list pagination and stats, super admin only (feature #4)."""

from sqlalchemy import text

from tests.support.factories import create_business


async def test_user_list_pagination(client, users):
    super_admin = await users.create("super_admin")
    for _ in range(3):
        await users.create()

    page = await client.get(
        "/api/v1/users/with-roles?page=1&page_size=2", headers=super_admin.headers
    )

    body = page.json()
    assert page.status_code == 200, page.text
    assert len(body["items"]) == 2
    assert body["total"] >= 4


async def test_user_stats(client, users):
    super_admin = await users.create("super_admin")

    response = await client.get("/api/v1/users/stats", headers=super_admin.headers)

    assert response.status_code == 200, response.text
    assert response.json()["total_users"] >= 1


async def test_admins_scope_lists_admins_only_with_owned_business_count(client, users, db_conn):
    """Admin Panel list: admins (and demoted self-registered accounts), never business members."""
    super_admin = await users.create("super_admin")
    admin = await users.create("admin")
    await create_business(client, admin)
    member = await users.create_member(admin, (await create_business(client, admin))["id"])
    demoted = await users.create("member")  # self-registered, switched to member by the super admin
    await db_conn.execute(text("UPDATE user_profiles SET full_name = 'Ada Admin' WHERE user_id = CAST(:u AS uuid)"),
                          {"u": admin.id})

    response = await client.get("/api/v1/users/with-roles?scope=admins&page=1&page_size=100",
                                headers=super_admin.headers)

    assert response.status_code == 200, response.text
    rows = {row["id"]: row for row in response.json()["items"]}
    assert admin.id in rows and demoted.id in rows
    assert super_admin.id not in rows and member.id not in rows
    assert (rows[admin.id]["full_name"], rows[admin.id]["businesses_owned"]) == ("Ada Admin", 2)
    assert response.json()["total"] == len(rows)


async def test_admins_scope_rejects_unknown_scope_and_non_super_admin(client, users):
    super_admin = await users.create("super_admin")
    admin = await users.create("admin")

    unknown = await client.get("/api/v1/users/with-roles?scope=everyone", headers=super_admin.headers)
    forbidden = await client.get("/api/v1/users/with-roles?scope=admins", headers=admin.headers)

    assert unknown.status_code == 422
    assert forbidden.status_code == 403
