"""Platform audit (super admin): platform-scope rows of every actor, never tenant business rows."""

from sqlalchemy import text

from tests.support.factories import create_business

PATH = "/api/v1/platform/audit"


async def _platform_row(db_conn, user_id: str, action: str) -> None:
    await db_conn.execute(
        text("INSERT INTO public.audit_logs (user_id, action, entity_type) VALUES (:u, :a, 'User')"),
        {"u": user_id, "a": action},
    )


async def test_super_admin_sees_platform_rows_of_other_actors(client, users, db_conn):
    super_admin = await users.create("super_admin")
    admin = await users.create("admin")
    await _platform_row(db_conn, admin.id, "platform_audit_probe")

    response = await client.get(PATH, params={"action": "platform_audit_probe"}, headers=super_admin.headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["user_id"] == admin.id
    assert body["items"][0]["scope"] == "platform"


async def test_platform_audit_never_returns_business_rows(client, users):
    super_admin = await users.create("super_admin")
    admin = await users.create("admin")
    await create_business(client, admin)

    response = await client.get(PATH, params={"page_size": 100}, headers=super_admin.headers)

    assert response.status_code == 200, response.text
    assert all(item["business_id"] is None for item in response.json()["items"])
    assert all(item["scope"] == "platform" for item in response.json()["items"])
