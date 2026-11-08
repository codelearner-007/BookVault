"""Direct PostgREST-role access (AC-04, CS-07) and DB-level tenant references (AC-02, CS-05).

RLS harness: inside the rolled-back test transaction, `SET LOCAL ROLE` switches to the
role PostgREST would use and `request.jwt.claims` carries a crafted token.
"""

import json
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError

API_ROLES = ["anon", "authenticated"]


async def _as_role(db_conn, role: str, user_id: str | None = None) -> None:
    claims = {"sub": user_id, "role": role, "user_role": "admin"} if user_id else {"role": role}
    await db_conn.execute(
        text("SELECT set_config('request.jwt.claims', :claims, true)"),
        {"claims": json.dumps(claims)},
    )
    await db_conn.execute(text(f"SET LOCAL ROLE {role}"))


async def _denied(db_conn, sql: str, params: dict | None = None) -> bool:
    savepoint = await db_conn.begin_nested()
    try:
        await db_conn.execute(text(sql), params or {})
    except DBAPIError as exc:
        await savepoint.rollback()
        return "permission denied" in str(exc)
    await savepoint.rollback()
    return False


async def test_authenticated_cannot_select_other_profiles(db_conn, users):
    me = await users.create("admin")
    await users.create("admin")
    await _as_role(db_conn, "authenticated", me.id)

    assert await _denied(db_conn, "SELECT user_id FROM public.user_profiles")


async def test_authenticated_cannot_write_user_roles(db_conn, users):
    me = await users.create("admin")
    await _as_role(db_conn, "authenticated", me.id)

    assert await _denied(
        db_conn,
        "INSERT INTO public.user_roles (user_id, role_id)"
        " SELECT :id, id FROM public.roles WHERE name = 'admin'",
        {"id": me.id},
    )


async def test_anon_has_no_table_privileges(db_conn):
    result = await db_conn.execute(
        text(
            "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants"
            " WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')"
        )
    )
    assert result.all() == []


@pytest.mark.parametrize("role", API_ROLES)
async def test_api_roles_cannot_call_security_definer_functions(db_conn, role):
    await _as_role(db_conn, role)
    assert await _denied(
        db_conn, "SELECT * FROM public.bank_account_balances(:id)", {"id": str(uuid.uuid4())}
    )


@pytest.mark.parametrize("role", API_ROLES)
async def test_suspense_balance_not_exposed(db_conn, role):
    await _as_role(db_conn, role)
    assert await _denied(
        db_conn, "SELECT public.suspense_balance(:id)", {"id": str(uuid.uuid4())}
    )


async def test_future_tables_get_no_api_privileges(db_conn):
    """Default privileges: a table a later migration creates is not exposed either."""
    await db_conn.execute(text("CREATE TABLE public.zz_probe (id int)"))
    result = await db_conn.execute(
        text(
            "SELECT count(*) FROM information_schema.role_table_grants"
            " WHERE table_name = 'zz_probe' AND grantee IN ('anon', 'authenticated')"
        )
    )
    assert result.scalar_one() == 0


async def _business(db_conn, owner_id: str) -> str:
    business_id = str(uuid.uuid4())
    await db_conn.execute(
        text("INSERT INTO public.businesses (id, name, owner_id) VALUES (:id, 'B', :owner)"),
        {"id": business_id, "owner": owner_id},
    )
    return business_id


async def test_db_composite_fk_blocks_cross_business_reference(db_conn, users):
    owner = await users.create("admin")
    business_a, business_b = await _business(db_conn, owner.id), await _business(db_conn, owner.id)
    account_b = str(uuid.uuid4())
    await db_conn.execute(
        text("INSERT INTO public.bank_accounts (id, business_id, name) VALUES (:id, :b, 'B bank')"),
        {"id": account_b, "b": business_b},
    )

    # B4: the legacy receipts table is gone; an item of A pointing at an account of B.
    savepoint = await db_conn.begin_nested()
    with pytest.raises(IntegrityError, match="items_income_account_fkey"):
        await db_conn.execute(
            text(
                "INSERT INTO public.items (business_id, item_kind_key, name, income_account_id)"
                " SELECT :a, 'non_inventory', 'Item', a.id FROM public.coa_accounts a"
                " WHERE a.business_id = :b LIMIT 1"
            ),
            {"a": business_a, "b": business_b},
        )
    await savepoint.rollback()


async def test_db_composite_fk_blocks_cross_business_coa_group(db_conn, users):
    owner = await users.create("admin")
    business_a, business_b = await _business(db_conn, owner.id), await _business(db_conn, owner.id)
    group_b = (
        await db_conn.execute(
            text(
                "SELECT id FROM public.coa_groups WHERE business_id = :b AND root_key = 'assets'"
            ),
            {"b": business_b},
        )
    ).scalar_one()

    savepoint = await db_conn.begin_nested()
    # The root trigger (B2) refuses it before the composite FK would.
    with pytest.raises(IntegrityError, match="coa_accounts_business_group_fkey|group of the same business"):
        await db_conn.execute(
            text(
                "INSERT INTO public.coa_accounts (business_id, name, type, group_id)"
                " VALUES (:a, 'X', 'asset', :g)"
            ),
            {"a": business_a, "g": group_b},
        )
    await savepoint.rollback()
