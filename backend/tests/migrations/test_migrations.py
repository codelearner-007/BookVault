"""Migration tests (mode T): apply to an empty DB, then apply new migrations over baseline data."""

import re

import pytest

from tests.support.test_db import (
    SEED_FILES,
    apply_sql_files,
    build_test_database,
    migration_files,
    query,
    run_sql,
)

# Migrations from this date on must follow the B0 rules (rollback comment, naming).
B0_START = "20261108000000"
NAME_PATTERN = re.compile(r"^\d{8}\d{6}_[a-z0-9_]+\.sql$")

OWNER = "0190f1d2-0000-7000-8000-000000000001"
BUSINESS = "0190f1d2-0000-7000-8000-000000000002"
BANK = "0190f1d2-0000-7000-8000-000000000003"

BASELINE_DATA = f"""
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('{OWNER}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'baseline@bookvault-test.dev', '', '{{}}', '{{}}', now(), now());
INSERT INTO public.businesses (id, name, owner_id) VALUES ('{BUSINESS}', 'Baseline', '{OWNER}');
INSERT INTO public.bank_accounts (id, business_id, name, opening_balance)
VALUES ('{BANK}', '{BUSINESS}', 'Bank', 100);
INSERT INTO public.receipts (business_id, date, received_in_account_id, lines)
VALUES ('{BUSINESS}', current_date, '{BANK}',
    '[{{"account_id": "suspense", "amount": 30, "total": 30}}]');
"""


def _new_migrations():
    return [m for m in migration_files() if m.name >= B0_START]


def test_new_migrations_are_named_and_have_rollback_comments():
    for migration in _new_migrations():
        assert NAME_PATTERN.match(migration.name), migration.name
        assert "ROLLBACK" in migration.read_text(encoding="utf-8"), migration.name


@pytest.mark.reset
def test_new_migrations_apply_over_baseline_data():
    build_test_database(stop_before=B0_START)
    run_sql(BASELINE_DATA)

    apply_sql_files([*_new_migrations(), *SEED_FILES])
    run_sql(f"SELECT public.recalculate_bank_account_balance('{BANK}');")

    assert query(f"SELECT current_balance FROM public.bank_accounts WHERE id = '{BANK}'") == [
        ["130.0000"]
    ]
    assert query(
        "SELECT sum((l->>'amount')::numeric) FROM public.receipts r, jsonb_array_elements(r.lines) l"
        f" WHERE r.business_id = '{BUSINESS}' AND l->>'account_id' = 'suspense'"
    ) == [["30"]]
    assert query("SELECT key FROM public.admin_tabs WHERE key LIKE 'receipt%'") == [["receipts"]]
    assert query(
        "SELECT confdeltype FROM pg_constraint WHERE conname = 'businesses_owner_id_fkey'"
    ) == [["r"]]
