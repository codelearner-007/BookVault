"""Admin has no platform powers; platform routes need a LIVE super_admin (AC-08, AC-09; CS-03, CS-04)."""

import uuid

import pytest
from sqlalchemy import text

from tests.support.factories import create_business

PLATFORM_ROUTES = [
    ("GET", "/api/v1/users/stats"),
    ("GET", "/api/v1/users/with-roles"),
    ("GET", "/api/v1/users/{other}/roles"),
    ("POST", "/api/v1/users/{other}/roles"),
    ("DELETE", "/api/v1/users/{other}/roles/{other}"),
    ("GET", "/api/v1/users/{other}/access-summary"),
    ("GET", "/api/v1/roles"),
    ("GET", "/api/v1/roles/{other}"),
    ("GET", "/api/v1/roles/{other}/permissions"),
    ("GET", "/api/v1/permissions"),
    ("GET", "/api/v1/dashboard/stats"),
    ("GET", "/api/v1/admin-tabs"),
    ("PUT", "/api/v1/admin-tabs"),
    ("DELETE", "/api/v1/admin-tabs/{other}"),
]
PLATFORM_IDS = [f"{m} {p}" for m, p in PLATFORM_ROUTES]


async def _call(client, user, method, path):
    url = path.format(other=uuid.uuid4())
    body = {"json": {}} if method in {"POST", "PUT"} else {}
    return await client.request(method, url, headers=user.headers, **body)


@pytest.mark.parametrize(("method", "path"), PLATFORM_ROUTES, ids=PLATFORM_IDS)
async def test_admin_cannot_use_platform_routes_403(client, users, method, path):
    admin = await users.create("admin")
    response = await _call(client, admin, method, path)
    assert response.status_code == 403, response.text


@pytest.mark.parametrize(("method", "path"), PLATFORM_ROUTES, ids=PLATFORM_IDS)
async def test_stale_super_admin_claim_is_not_trusted(client, users, method, path):
    """A token still saying super_admin after the role was removed gets 403 (live check)."""
    demoted = await users.create("admin", token_role="super_admin")
    response = await _call(client, demoted, method, path)
    assert response.status_code == 403, response.text


async def test_admin_cannot_list_platform_users_403(client, users):
    admin = await users.create("admin")
    response = await client.get("/api/v1/users/with-roles", headers=admin.headers)
    assert response.status_code == 403


async def test_live_super_admin_can_list_platform_users(client, users):
    super_admin = await users.create("super_admin")
    response = await client.get("/api/v1/users/with-roles", headers=super_admin.headers)
    assert response.status_code == 200, response.text


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/api/v1/roles"),
        ("PATCH", "/api/v1/roles/{other}"),
        ("DELETE", "/api/v1/roles/{other}"),
        ("PUT", "/api/v1/roles/{other}/permissions"),
        ("POST", "/api/v1/permissions"),
        ("DELETE", "/api/v1/permissions/{other}"),
    ],
)
async def test_admin_cannot_create_global_role_403(client, users, method, path):
    """Global role/permission editing is removed (NA-01): no caller can reach it."""
    super_admin = await users.create("super_admin")
    response = await _call(client, super_admin, method, path)
    assert response.status_code in {404, 405}, response.text


async def _signup(db_conn) -> str:
    """Insert an auth user like GoTrue does; handle_new_user assigns the role."""
    user_id = str(uuid.uuid4())
    await db_conn.execute(
        text(
            "INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,"
            " raw_app_meta_data, raw_user_meta_data, created_at, updated_at)"
            " VALUES (:id, '00000000-0000-0000-0000-000000000000', 'authenticated',"
            " 'authenticated', :email, '', '{}', '{}', now(), now())"
        ),
        {"id": user_id, "email": f"{user_id[:8]}@bookvault-test.dev"},
    )
    return user_id


async def _live_role(db_conn, user_id: str) -> str:
    result = await db_conn.execute(
        text(
            "SELECT r.name FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id"
            " WHERE ur.user_id = :id"
        ),
        {"id": user_id},
    )
    return result.scalar_one()


async def test_second_signup_is_admin_without_platform_powers(client, users, db_conn):
    await users.create("super_admin")  # a super admin exists
    user_id = await _signup(db_conn)
    assert await _live_role(db_conn, user_id) == "admin"


async def test_new_signup_is_not_platform_admin(client, users, db_conn):
    """A non-bootstrap signup is admin and gets 403 on every platform route."""
    await users.create("super_admin")
    signup = await users.create("admin")
    for method, path in PLATFORM_ROUTES:
        response = await _call(client, signup, method, path)
        assert response.status_code == 403, f"{method} {path}: {response.text}"


async def test_access_summary_reports_live_super_admin(client, users):
    """Backs the Next.js guard (test_cannot_ban_super_admin / _delete_): role read from user_roles."""
    super_admin = await users.create("super_admin")
    target = await users.create("super_admin", token_role="admin")

    response = await client.get(
        f"/api/v1/users/{target.id}/access-summary", headers=super_admin.headers
    )

    assert response.status_code == 200, response.text
    assert response.json()["user_role"] == "super_admin"


async def test_access_summary_counts_owned_businesses(client, users):
    super_admin, owner = await users.create("super_admin"), await users.create("admin")
    await create_business(client, owner)

    response = await client.get(
        f"/api/v1/users/{owner.id}/access-summary", headers=super_admin.headers
    )

    assert response.json() == {"user_id": owner.id, "user_role": "admin", "owned_business_count": 1}


@pytest.mark.committed
async def test_deleting_owner_does_not_delete_businesses(committed):
    """businesses.owner_id is ON DELETE RESTRICT (CS-10): the delete fails, data stays."""
    owner = await committed.create("admin")
    business_id = str(uuid.uuid4())
    await committed.conn.execute(
        text("INSERT INTO public.businesses (id, name, owner_id) VALUES (:id, 'Keep', :owner)"),
        {"id": business_id, "owner": owner.id},
    )

    with pytest.raises(Exception, match="businesses_owner_id_fkey"):
        await committed.conn.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": owner.id})

    remaining = await committed.conn.execute(
        text("SELECT count(*) FROM public.businesses WHERE id = :id"), {"id": business_id}
    )
    assert remaining.scalar_one() == 1
