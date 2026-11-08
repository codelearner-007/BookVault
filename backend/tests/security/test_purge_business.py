"""Audited permanent business purge (B0.8, NA-09, threat-model AC-23)."""

import time
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.core.config import settings
from tests.conftest import TEST_JWT_SECRET
from tests.support.factories import (
    add_member,
    create_bank_account,
    create_business,
    create_contact,
    make_token,
    purge_business,
)

BASE = "/api/v1/businesses"
SCOPED_TABLES_SQL = "SELECT unnest(public.business_scoped_tables())"


def _reauth_headers(user, seconds_ago: int = 0) -> dict[str, str]:
    """A token whose password sign-in happened `seconds_ago` (JWT amr, as GoTrue issues it)."""
    amr = [{"method": "password", "timestamp": int(time.time()) - seconds_ago}]
    token = make_token(TEST_JWT_SECRET, user.id, user.email, user.role, extra={"amr": amr})
    return {"Authorization": f"Bearer {token}"}


async def _trashed_business(client, owner, name: str = "Acme") -> dict:
    business = await create_business(client, owner, name)
    await client.delete(f"{BASE}/{business['id']}", headers=owner.headers)
    return business


async def _purge(client, headers, business, **body):
    payload = {"confirmation": business["name"], "export_offered": True, **body}
    return await client.request(
        "DELETE", f"{BASE}/{business['id']}/permanent", json=payload, headers=headers
    )


async def _remaining_rows(conn, business_id: str) -> dict[str, int]:
    tables = [row[0] for row in (await conn.execute(text(SCOPED_TABLES_SQL))).all()]
    counts = {}
    for table in [*tables, "businesses"]:
        column = "id" if table == "businesses" else "business_id"
        result = await conn.execute(
            text(f"SELECT count(*) FROM public.{table} WHERE {column} = CAST(:b AS uuid)"),
            {"b": business_id},
        )
        counts[table] = result.scalar_one()
    return counts


async def test_purge_requires_owner(client, users):
    owner, super_admin = await users.create(), await users.create("super_admin")
    business = await create_business(client, owner)
    full_member = await users.create_member(owner, business["id"])
    await add_member(client, owner, business["id"], full_member, access_mode="full")
    await client.delete(f"{BASE}/{business['id']}", headers=owner.headers)

    as_super_admin = await _purge(client, _reauth_headers(super_admin), business)
    as_member = await _purge(client, _reauth_headers(full_member), business)

    assert as_super_admin.status_code == 404, as_super_admin.text
    assert as_member.status_code == 404, as_member.text


async def test_purge_requires_recent_reauth(client, users):
    owner = await users.create()
    business = await _trashed_business(client, owner)

    no_reauth = await _purge(client, owner.headers, business)
    stale = await _purge(
        client, _reauth_headers(owner, settings.REAUTH_MAX_AGE_SECONDS + 60), business
    )

    for response in (no_reauth, stale):
        assert response.status_code == 403
        assert response.json()["details"]["code"] == "reauth_required"


async def test_purge_requires_typed_confirmation(client, users):
    owner = await users.create()
    business = await _trashed_business(client, owner)

    response = await _purge(client, _reauth_headers(owner), business, confirmation="acme")

    assert response.status_code == 422
    assert response.json()["details"]["code"] == "confirmation_mismatch"


async def test_purge_requires_export_offered(client, users):
    owner = await users.create()
    business = await _trashed_business(client, owner)

    response = await _purge(client, _reauth_headers(owner), business, export_offered=False)

    assert response.status_code == 422
    assert response.json()["details"]["code"] == "export_required"


async def test_purge_only_from_trash(client, users):
    owner = await users.create()
    business = await create_business(client, owner)

    response = await _purge(client, _reauth_headers(owner), business)

    assert response.status_code == 400


async def test_purge_removes_all_business_rows_via_api(client, users, db_conn):
    owner = await users.create()
    business = await create_business(client, owner)
    await create_bank_account(client, owner, business["id"])
    await create_contact(client, owner, business["id"])
    await client.delete(f"{BASE}/{business['id']}", headers=owner.headers)

    response = await _purge(client, _reauth_headers(owner), business)

    assert response.status_code == 204, response.text
    assert set((await _remaining_rows(db_conn, business["id"])).values()) == {0}
    trash = await client.get(f"{BASE}/deleted", headers=owner.headers)
    assert trash.json()["items"] == []


@pytest.mark.committed
async def test_purge_removes_all_business_rows(committed):
    """Mode C: the purge commits; nothing of the business is left, the platform row stays."""
    owner = await committed.create("admin")
    business_id = str(uuid.uuid4())
    await committed.conn.execute(
        text("INSERT INTO public.businesses (id, name, owner_id) VALUES (:id, 'Gone', :owner)"),
        {"id": business_id, "owner": owner.id},
    )
    await committed.conn.execute(
        text("INSERT INTO public.customers (business_id, name) VALUES (:id, 'C')"), {"id": business_id}
    )
    await committed.conn.execute(
        text("INSERT INTO public.audit_logs (scope, business_id, user_id, action, entity_type)"
             " VALUES ('business', :id, :owner, 'create', 'Customer')"),
        {"id": business_id, "owner": owner.id},
    )

    counts = await purge_business(committed.conn, business_id, owner.id, "Gone")

    assert counts["customers"] == 1 and counts["audit_logs"] == 1 and counts["businesses"] == 1
    assert set((await _remaining_rows(committed.conn, business_id)).values()) == {0}
    platform_rows = await committed.conn.execute(
        text("SELECT count(*) FROM public.audit_logs WHERE scope = 'platform'"
             " AND action = 'business_purged' AND entity_id = :id"),
        {"id": business_id},
    )
    assert platform_rows.scalar_one() == 1


async def test_purge_writes_platform_audit_row(client, users, db_conn):
    owner = await users.create()
    business = await _trashed_business(client, owner, "Audited Ltd")

    await _purge(client, _reauth_headers(owner), business)
    rows = (await db_conn.execute(
        text("SELECT scope, business_id, user_id::text, details FROM public.audit_logs"
             " WHERE action = 'business_purged' AND entity_id = :id"),
        {"id": business["id"]},
    )).all()

    assert len(rows) == 1
    scope, business_id, actor, details = rows[0]
    assert (scope, business_id, actor) == ("platform", None, owner.id)
    assert details["name"] == "Audited Ltd" and details["business_id"] == business["id"]
    assert details["row_counts"]["businesses"] == 1 and details["row_counts"]["coa_groups"] > 0


async def test_export_offered_before_purge_returns_business_rows(client, users):
    owner, stranger = await users.create(), await users.create()
    business = await _trashed_business(client, owner)

    export = await client.get(f"{BASE}/{business['id']}/export", headers=owner.headers)
    refused = await client.get(f"{BASE}/{business['id']}/export", headers=stranger.headers)

    assert export.status_code == 200, export.text
    tables = export.json()["tables"]
    assert [row["id"] for row in tables["businesses"]] == [business["id"]]
    assert tables["coa_accounts"] and tables["business_members"]
    assert refused.status_code == 404


@pytest.mark.parametrize(
    ("role", "statement"),
    [
        ("postgres", "DELETE FROM public.audit_logs WHERE id = :id"),
        ("bookvault_api", "DELETE FROM public.audit_logs WHERE id = :id"),
        ("bookvault_purge", "UPDATE public.audit_logs SET action = 'x' WHERE id = :id"),
    ],
)
async def test_immutability_triggers_block_delete_outside_purge(db_conn, role, statement):
    """AC-23: audit rows change only through the purge function (and then only by DELETE)."""
    row_id = (await db_conn.execute(text(
        "INSERT INTO public.audit_logs (user_id, action, entity_type)"
        " VALUES (gen_random_uuid(), 'create', 'Thing') RETURNING id::text"
    ))).scalar_one()

    async with db_conn.begin_nested() as savepoint:
        if role != "postgres":
            await db_conn.execute(text(f"SET LOCAL ROLE {role}"))
        with pytest.raises(DBAPIError):
            await db_conn.execute(text(statement), {"id": row_id})
        await savepoint.rollback()


async def test_owner_membership_delete_blocked_outside_purge(client, users, db_conn):
    owner = await users.create()
    business = await create_business(client, owner)

    with pytest.raises(DBAPIError, match="owner membership"):
        async with db_conn.begin_nested():
            await db_conn.execute(
                text("DELETE FROM public.business_members WHERE business_id = CAST(:b AS uuid)"),
                {"b": business["id"]},
            )
