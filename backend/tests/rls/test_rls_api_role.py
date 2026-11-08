"""Tenant RLS for the FastAPI database role (B0.4: AC-04, AC-05; platform-model 5.2).

Queries run directly against the test database as `bookvault_api` (SET LOCAL ROLE inside
the rolled-back test transaction) with `app.user_id` set the way app/db/session.py sets it.
"""

from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from tests.support.factories import add_member, create_business, create_contact

API_ROLE = "bookvault_api"
HELPERS = ["is_business_member", "has_area_access", "has_area_write_access", "is_platform_super_admin",
           "member_has_area_access"]
ENV_EXAMPLE = Path(__file__).resolve().parents[2] / ".env.example"


async def _as_api(db_conn, user_id: str | None) -> None:
    await db_conn.execute(text(f"SET LOCAL ROLE {API_ROLE}"))
    await db_conn.execute(text("SELECT set_config('app.user_id', :u, true)"), {"u": user_id or ""})


async def _as_admin(db_conn) -> None:
    await db_conn.execute(text("RESET ROLE"))


async def _count(db_conn, sql: str, params: dict | None = None) -> int:
    return (await db_conn.execute(text(sql), params or {})).scalar_one()


async def _rejected(db_conn, sql: str, params: dict | None = None) -> str | None:
    """Run in a savepoint; the database error text, or None when the statement succeeded."""
    savepoint = await db_conn.begin_nested()
    try:
        await db_conn.execute(text(sql), params or {})
    except DBAPIError as exc:
        await savepoint.rollback()
        return str(exc.orig)
    await savepoint.rollback()
    return None


async def _rowcount(db_conn, sql: str, params: dict) -> int:
    savepoint = await db_conn.begin_nested()
    result = await db_conn.execute(text(sql), params)
    await savepoint.rollback()
    return result.rowcount


async def _tenant(client, users) -> tuple:
    owner = await users.create()
    business = await create_business(client, owner)
    customer = await create_contact(client, owner, business["id"])
    return owner, business["id"], customer["id"]


# ------------------------------------------------------------------ catalog (AC-05)


async def test_backend_db_role_is_not_superuser(db_conn):
    row = (await db_conn.execute(text(
        "SELECT rolsuper, rolbypassrls, rolcanlogin, rolcreaterole, rolcreatedb"
        " FROM pg_roles WHERE rolname = :r"), {"r": API_ROLE})).one()
    assert tuple(row) == (False, False, True, False, False)
    owner = (await db_conn.execute(text(
        "SELECT rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = 'bookvault_rls_owner'"))).one()
    assert tuple(owner) == (False, True)


def test_backend_connects_as_api_role():
    urls = [line for line in ENV_EXAMPLE.read_text().splitlines() if line.startswith("DATABASE_URL=")]
    assert urls and urls[0].startswith(f"DATABASE_URL=postgresql://{API_ROLE}:")


async def test_api_role_has_no_blanket_grants(db_conn):
    """No privilege on objects nobody granted it (least privilege, no GRANT ALL)."""
    rows = await db_conn.execute(text(
        "SELECT table_name, privilege_type FROM information_schema.role_table_grants"
        " WHERE grantee = :r AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')"),
        {"r": API_ROLE})
    assert rows.all() == []


async def test_rls_enabled_and_forced_on_every_business_table(db_conn):
    rows = await db_conn.execute(text(
        "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace"
        " WHERE n.nspname = 'public' AND c.relkind = 'r'"
        "   AND NOT (c.relrowsecurity AND c.relforcerowsecurity)"))
    assert rows.scalars().all() == []


async def test_rls_helpers_are_security_definer_with_empty_search_path(db_conn):
    rows = (await db_conn.execute(text(
        "SELECT p.proname, p.prosecdef, p.provolatile::text, p.proconfig, pg_get_userbyid(p.proowner)"
        " FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY(:n)"),
        {"n": HELPERS})).all()
    assert sorted(r[0] for r in rows) == sorted(HELPERS)
    for name, secdef, volatility, config, owner in rows:
        assert (secdef, volatility, config, owner) == (True, "s", ["search_path=\"\""], "bookvault_rls_owner"), name


# Documents are voided, never deleted; posted ledger rows are immutable (B1): no DELETE policy.
# An opening balance link stays with its (possibly void) document (B2).
APPEND_ONLY = {"audit_logs", "documents", "journal_entries", "journal_lines", "opening_balances"}
# One row per business, inserted by a trigger and removed by the FK cascade (B0.7).
# business_currencies (creation trigger) and document_sequences (next_document_reference())
# are written by SECURITY DEFINER functions only (B1).
SINGLETONS = {"business_settings", "business_currencies", "document_sequences"}


async def test_business_tables_have_policies_for_every_command(db_conn):
    rows = await db_conn.execute(text(
        "SELECT c.relname FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid"
        " WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'"
        "   AND a.attname = 'business_id' AND NOT a.attisdropped"))
    for table in rows.scalars().all():
        commands = set((await db_conn.execute(text(
            "SELECT array_agg(DISTINCT cmd) FROM pg_policies"
            " WHERE schemaname = 'public' AND tablename = :t AND :r = ANY(roles)"),
            {"t": table, "r": API_ROLE})).scalar_one() or [])
        if "ALL" in commands:
            continue
        # audit_logs is append-only (B0.5): read and insert, never update or delete.
        expected = {"SELECT", "INSERT"} if table in APPEND_ONLY else {"SELECT", "INSERT", "DELETE"}
        if table in SINGLETONS:
            expected = {"SELECT"}
        assert expected <= commands, table


# ------------------------------------------------------------------ context


async def test_query_without_context_returns_no_rows(users, db_conn):
    """No API request ran on this connection, so app.user_id was never set (NULL), then ''."""
    owner = await users.create()
    business_id = (await db_conn.execute(text(
        "INSERT INTO businesses (name, owner_id) VALUES ('Acme', CAST(:o AS uuid)) RETURNING id"),
        {"o": owner.id})).scalar_one()
    tables = ("businesses", "business_members", "coa_accounts", "user_profiles", "user_roles", "audit_logs")
    owner_rows = "SELECT count(*) FROM business_members WHERE business_id = :b"
    assert await _count(db_conn, owner_rows, {"b": business_id}) == 1  # postgres sees it

    for setting in (None, ""):
        await db_conn.execute(text(f"SET LOCAL ROLE {API_ROLE}"))
        if setting is not None:
            await db_conn.execute(text("SELECT set_config('app.user_id', '', true)"))
        for table in tables:
            assert await _count(db_conn, f"SELECT count(*) FROM public.{table}") == 0, table
        assert await _count(db_conn, "SELECT count(*) FROM private.accounts") == 0
        await _as_admin(db_conn)


async def test_rls_policies_do_not_recurse(client, users, db_conn):
    owner, business_id, _ = await _tenant(client, users)
    member = await users.create_member(owner, business_id)
    await add_member(client, owner, business_id, member, "custom",
                     [{"area_key": "customers", "rights": ["view"]}])

    for user in (owner, member):
        await _as_api(db_conn, user.id)
        assert await _count(db_conn, "SELECT count(*) FROM business_members") >= 1
        assert await _count(db_conn, "SELECT count(*) FROM business_member_area_access") >= 0
        assert await _count(db_conn, "SELECT count(*) FROM customers") == 1
        assert await _count(db_conn, "SELECT count(*) FROM user_profiles") >= 1
        await _as_admin(db_conn)


async def test_member_sees_only_own_membership_owner_sees_all(client, users, db_conn):
    owner, business_id, _ = await _tenant(client, users)
    member = await users.create_member(owner, business_id)
    await add_member(client, owner, business_id, member, "full")

    await _as_api(db_conn, member.id)
    assert await _count(db_conn, "SELECT count(*) FROM business_members") == 1
    await _as_api(db_conn, owner.id)
    assert await _count(db_conn, "SELECT count(*) FROM business_members") == 2


# ------------------------------------------------------------------ cross-tenant (AC-01, AC-05)


async def test_cross_tenant_rows_invisible_and_unwritable(client, users, db_conn):
    a_owner, a_business, _ = await _tenant(client, users)
    _, b_business, b_customer = await _tenant(client, users)
    await _as_api(db_conn, a_owner.id)
    params = {"b": b_business, "c": b_customer}

    for table in ("businesses", "customers", "coa_accounts", "coa_groups", "business_members"):
        column = "id" if table == "businesses" else "business_id"
        assert await _count(db_conn, f"SELECT count(*) FROM {table} WHERE {column} = CAST(:b AS uuid)", params) == 0
    assert "row-level security" in await _rejected(
        db_conn, "INSERT INTO customers (business_id, name) VALUES (CAST(:b AS uuid), 'x')", params)
    assert await _rowcount(db_conn, "UPDATE customers SET name = 'x' WHERE id = CAST(:c AS uuid)", params) == 0
    assert await _rowcount(db_conn, "DELETE FROM customers WHERE id = CAST(:c AS uuid)", params) == 0
    assert await _rowcount(db_conn, "UPDATE businesses SET name = 'x' WHERE id = CAST(:b AS uuid)", params) == 0
    assert "row-level security" in await _rejected(
        db_conn, "INSERT INTO business_members (business_id, user_id, access_mode, status_id)"
                 " SELECT CAST(:b AS uuid), CAST(:u AS uuid), 'full', id FROM member_statuses WHERE key = 'active'",
        {**params, "u": a_owner.id})
    assert await _count(db_conn, "SELECT count(*) FROM private.accounts") == 1


async def test_api_role_cannot_create_business_for_someone_else(client, users, db_conn):
    me, other = await users.create(), await users.create()
    await _as_api(db_conn, me.id)
    assert "row-level security" in await _rejected(
        db_conn, "INSERT INTO businesses (name, owner_id) VALUES ('x', CAST(:o AS uuid))", {"o": other.id})


# ------------------------------------------------------------------ D-39 command mapping


async def _member_with(client, users, rights: list[str]):
    owner, business_id, customer_id = await _tenant(client, users)
    member = await users.create_member(owner, business_id)
    await add_member(client, owner, business_id, member, "custom",
                     [{"area_key": "customers", "rights": rights}] if rights else [])
    return member, {"b": business_id, "c": customer_id}


async def test_rls_select_requires_view(client, users, db_conn):
    member, _ = await _member_with(client, users, [])
    await _as_api(db_conn, member.id)
    assert await _count(db_conn, "SELECT count(*) FROM customers") == 0
    assert await _count(db_conn, "SELECT count(*) FROM businesses") == 1  # every member reads it


async def test_rls_insert_requires_create(client, users, db_conn):
    member, params = await _member_with(client, users, ["view"])
    await _as_api(db_conn, member.id)
    insert = "INSERT INTO customers (business_id, name) VALUES (CAST(:b AS uuid), 'x')"
    assert "row-level security" in await _rejected(db_conn, insert, params)

    await _as_admin(db_conn)
    member, params = await _member_with(client, users, ["create"])
    await _as_api(db_conn, member.id)
    assert await _rejected(db_conn, insert, params) is None


async def test_rls_update_requires_edit(client, users, db_conn):
    update = "UPDATE customers SET name = 'x' WHERE id = CAST(:c AS uuid)"
    member, params = await _member_with(client, users, ["create", "delete"])
    await _as_api(db_conn, member.id)
    assert await _rowcount(db_conn, update, params) == 0

    await _as_admin(db_conn)
    member, params = await _member_with(client, users, ["edit"])
    await _as_api(db_conn, member.id)
    assert await _rowcount(db_conn, update, params) == 1


async def test_rls_delete_requires_delete(client, users, db_conn):
    delete = "DELETE FROM customers WHERE id = CAST(:c AS uuid)"
    member, params = await _member_with(client, users, ["create", "edit"])
    await _as_api(db_conn, member.id)
    assert await _rowcount(db_conn, delete, params) == 0

    await _as_admin(db_conn)
    member, params = await _member_with(client, users, ["delete"])
    await _as_api(db_conn, member.id)
    assert await _rowcount(db_conn, delete, params) == 1


async def test_rls_soft_delete_requires_delete_not_edit(client, users, db_conn):
    owner, business_id, _ = await _tenant(client, users)
    member = await users.create_member(owner, business_id)
    await add_member(client, owner, business_id, member, "full")  # every right except owner-only areas
    await _as_api(db_conn, member.id)
    params = {"b": business_id}

    assert await _rowcount(db_conn, "UPDATE businesses SET name = 'Renamed' WHERE id = CAST(:b AS uuid)", params) == 1
    assert "row-level security" in await _rejected(
        db_conn, "UPDATE businesses SET deleted_at = now() WHERE id = CAST(:b AS uuid)", params)


@pytest.mark.parametrize("right", ["view", "create", "edit", "delete"])
async def test_rls_has_area_access_rejects_unknown_right_and_area(client, users, db_conn, right):
    owner, business_id, _ = await _tenant(client, users)
    await _as_api(db_conn, owner.id)
    check = "SELECT public.has_area_access(CAST(:b AS uuid), :a, :r)"
    params = {"b": business_id}
    assert (await db_conn.execute(text(check), {**params, "a": "customers", "r": right})).scalar() is True
    assert (await db_conn.execute(text(check), {**params, "a": "customers", "r": right + "x"})).scalar() is False
    assert (await db_conn.execute(text(check), {**params, "a": "nope", "r": right})).scalar() is False
    expected_on_view_only = right == "view"
    assert (await db_conn.execute(text(check), {**params, "a": "reports", "r": right})).scalar() is expected_on_view_only


# ------------------------------------------------------------------ platform tables


async def test_platform_tables_restricted_to_super_admin_path(client, users, db_conn):
    admin, super_admin = await users.create(), await users.create("super_admin")
    await _as_api(db_conn, admin.id)
    assert await _count(db_conn, "SELECT count(*) FROM user_roles") == 1  # own row only
    assert await _count(db_conn, "SELECT count(*) FROM platform_settings") == 0
    assert "row-level security" in await _rejected(
        db_conn, "INSERT INTO admin_tabs (key, label, order_index) VALUES ('zz', 'zz', 99)")
    assert await _rowcount(db_conn, "DELETE FROM user_roles WHERE user_id = CAST(:u AS uuid)",
                           {"u": super_admin.id}) == 0

    await _as_api(db_conn, super_admin.id)
    assert await _count(db_conn, "SELECT count(*) FROM user_roles") >= 2
    assert await _count(db_conn, "SELECT count(*) FROM businesses") == 0  # no tenant data (D-14)


async def test_api_role_cannot_assign_super_admin(client, users, db_conn):
    super_admin, target = await users.create("super_admin"), await users.create()
    await _as_api(db_conn, super_admin.id)
    error = await _rejected(
        db_conn, "UPDATE user_roles SET role_id = (SELECT id FROM roles WHERE name = 'super_admin')"
                 " WHERE user_id = CAST(:u AS uuid)", {"u": target.id})
    assert error and "Super admin role cannot be assigned directly" in error
