"""scripts/cleanup_test_accounts.py: test-domain accounts and their businesses go through the
audited purge path after a backup; any other account is left alone."""

import pytest
from sqlalchemy import text


from scripts import cleanup_test_accounts
from tests.conftest import ASYNC_TEST_DATABASE_URL
from tests.support.factories import create_business
from tests.support.test_db import TEST_DB


async def _count(conn, sql: str, **params) -> int:
    return (await conn.execute(text(sql), params)).scalar_one()


@pytest.mark.committed
async def test_cleanup_purges_test_accounts_only(committed, live_client, tmp_path, monkeypatch):
    doomed = await committed.create("admin")
    kept = await committed.create("admin")
    await committed.conn.execute(text("UPDATE auth.users SET email = 'kept-' || id || '@example.com' "
                                      "WHERE id = CAST(:id AS uuid)"), {"id": kept.id})
    business = await create_business(live_client, doomed, "Cleanup E2E")
    kept_business = await create_business(live_client, kept, "Real business")
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path))

    assert await cleanup_test_accounts.run(ASYNC_TEST_DATABASE_URL, apply=True, backup_db=TEST_DB) == 0

    conn = committed.conn
    assert await _count(conn, "SELECT count(*) FROM auth.users WHERE id = CAST(:id AS uuid)", id=doomed.id) == 0
    assert await _count(conn, "SELECT count(*) FROM public.businesses WHERE id = CAST(:id AS uuid)",
                        id=business["id"]) == 0
    assert await _count(conn, "SELECT count(*) FROM public.audit_logs WHERE action = 'business_purged' "
                              "AND entity_id = :id", id=business["id"]) == 1
    assert await _count(conn, "SELECT count(*) FROM public.audit_logs WHERE action = 'test_account_deleted' "
                              "AND entity_id = :id", id=doomed.id) == 1
    assert await _count(conn, "SELECT count(*) FROM auth.users WHERE id = CAST(:id AS uuid)", id=kept.id) == 1
    assert await _count(conn, "SELECT count(*) FROM public.businesses WHERE id = CAST(:id AS uuid)",
                        id=kept_business["id"]) == 1
    assert list(tmp_path.glob("cleanup_test_accounts_*.dump"))
