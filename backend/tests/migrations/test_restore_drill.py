"""Restore drill (mode T, B0.8): dump the seeded test database, restore it into a fresh one,
compare row counts per table and the balances per business (Trial Balance once B1 exists)."""

import pytest

from scripts.db_backup import dump, restore, verify
from tests.support.test_db import SOURCE_DB, TEST_DB, _docker, _psql, build_test_database, run_sql

DRILL_DB = f"{TEST_DB}_restore_drill"
OWNER = "0190f1d2-0000-7000-8000-0000000000d1"
BUSINESS = "0190f1d2-0000-7000-8000-0000000000d2"
BANK = "0190f1d2-0000-7000-8000-0000000000d3"

SEED = f"""
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('{OWNER}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'drill@bookvault-test.dev', '', '{{}}', '{{}}', now(), now());
INSERT INTO public.businesses (id, name, owner_id) VALUES ('{BUSINESS}', 'Drill', '{OWNER}');
INSERT INTO public.bank_accounts (id, business_id, name, opening_balance)
VALUES ('{BANK}', '{BUSINESS}', 'Bank', 100);
INSERT INTO public.customers (business_id, name) VALUES ('{BUSINESS}', 'Customer');
INSERT INTO public.receipts (business_id, date, received_in_account_id, lines)
VALUES ('{BUSINESS}', current_date, '{BANK}', '[{{"account_id": "suspense", "amount": 30, "total": 30}}]');
INSERT INTO public.audit_logs (scope, business_id, user_id, action, entity_type)
VALUES ('business', '{BUSINESS}', '{OWNER}', 'create', 'Business');
"""

ROW_COUNTS = """
SELECT table_schema || '.' || table_name,
       (xpath('/row/c/text()', query_to_xml(
           format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_schema IN ('public', 'auth') AND table_type = 'BASE TABLE'
ORDER BY 1
"""
BALANCES = """
SELECT b.id, b.name, ba.current_balance,
       (SELECT count(*) FROM public.receipts r WHERE r.business_id = b.id)
FROM public.businesses b LEFT JOIN public.bank_accounts ba ON ba.business_id = b.id
ORDER BY b.id, ba.id
"""


def _query(database: str, sql: str) -> list[str]:
    return _docker("psql", "-U", "postgres", "-d", database, "-At", "-F", "|", "-c", sql).splitlines()


@pytest.mark.reset
def test_restore_drill_matches_source(tmp_path):
    build_test_database()
    run_sql(SEED)
    run_sql(f"SELECT public.recalculate_bank_account_balance('{BANK}');")
    backup = dump(TEST_DB, "restore_drill", tmp_path)
    verify(backup)

    _psql(SOURCE_DB, f'DROP DATABASE IF EXISTS "{DRILL_DB}" WITH (FORCE);')
    _psql(SOURCE_DB, f'CREATE DATABASE "{DRILL_DB}";')
    try:
        restore(DRILL_DB, backup)

        source_counts, restored_counts = _query(TEST_DB, ROW_COUNTS), _query(DRILL_DB, ROW_COUNTS)
        assert restored_counts == source_counts and len(source_counts) > 20
        assert _query(DRILL_DB, BALANCES) == _query(TEST_DB, BALANCES)
        assert f"{BUSINESS}|Drill|130.0000|1" in _query(DRILL_DB, BALANCES)
        owners = _query(DRILL_DB, "SELECT pg_get_userbyid(proowner) FROM pg_proc"
                                  " WHERE proname = 'purge_business'")
        assert owners == ["bookvault_purge"]
    finally:
        _psql(SOURCE_DB, f'DROP DATABASE IF EXISTS "{DRILL_DB}" WITH (FORCE);')
