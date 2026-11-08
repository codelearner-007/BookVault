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

    # B3: the receipt and the opening balance are on the ledger (bank 130, Suspense credited 30).
    assert query(f"SELECT sum(debit - credit) FROM public.journal_lines WHERE bank_account_id = '{BANK}'") == [
        ["130.0000"]
    ]
    assert query(
        "SELECT sum(l.credit - l.debit) FROM public.journal_lines l"
        " JOIN public.coa_accounts a ON a.id = l.account_id"
        " JOIN public.system_account_types s ON s.id = a.system_account_type_id AND s.code = 'suspense'"
        f" WHERE l.business_id = '{BUSINESS}'"
    ) == [["30.0000"]]
    assert query("SELECT key FROM public.admin_tabs WHERE key LIKE 'receipt%'") == [["receipts"]]
    assert query(
        "SELECT confdeltype FROM pg_constraint WHERE conname = 'businesses_owner_id_fkey'"
    ) == [["r"]]


B3_RECEIPTS = "20261108000032"
CUSTOMER = "0190f1d2-0000-7000-8000-000000000004"
SALES = "0190f1d2-0000-7000-8000-000000000005"
GOOD, SUSPENSE, NO_BANK, BAD_ACCOUNT, BAD_CONTACT = (
    f"0190f1d2-0000-7000-8000-0000000001{n:02d}" for n in range(1, 6))


def _receipt(receipt_id: str, bank: str | None, lines: str, contact: str | None = None) -> str:
    bank_sql = f"'{bank}'" if bank else "NULL"
    contact_sql = f"'Contact', '{contact}', 'customer'" if contact else "'Other', NULL, NULL"
    return (f"INSERT INTO public.receipts (id, business_id, date, reference, received_in_account_id, paid_by_type,"
            f" paid_by_contact_id, paid_by_contact_type, lines) VALUES ('{receipt_id}', '{BUSINESS}',"
            f" '2026-11-02', 'R-{receipt_id[-2:]}', {bank_sql}, {contact_sql}, '{lines}');")


@pytest.mark.reset
def test_receipts_migration_preserves_bank_balances():
    """NA-03 / D-06: every receipt is posted with the amount it showed, or kept as a draft; every
    bank balance equals its pre-migration value (ledger + drafts on the account)."""
    build_test_database(stop_before=B3_RECEIPTS)
    run_sql(BASELINE_DATA.split("INSERT INTO public.bank_accounts")[0] + f"""
        UPDATE public.business_settings SET books_start_date = '2026-01-01' WHERE business_id = '{BUSINESS}';
        INSERT INTO public.coa_accounts (id, business_id, name, type, group_id)
        SELECT '{SALES}', '{BUSINESS}', 'Sales', 'income', id FROM public.coa_groups
        WHERE business_id = '{BUSINESS}' AND root_key = 'income';
        INSERT INTO public.bank_accounts (id, business_id, name, opening_balance) VALUES ('{BANK}', '{BUSINESS}', 'Bank', 100);
        INSERT INTO public.customers (id, business_id, name) VALUES ('{CUSTOMER}', '{BUSINESS}', 'Customer');
        {_receipt(GOOD, BANK, f'[{{"account_id": "{SALES}", "amount": 20, "qty": 2, "discount": 5, "total": 35}}]', CUSTOMER)}
        {_receipt(BAD_CONTACT, BANK, f'[{{"account_id": "{SALES}", "amount": 7, "total": 7}}]', BANK)}
        {_receipt(SUSPENSE, BANK, '[{"account_id": "suspense", "amount": 30, "total": 30}]')}
        {_receipt(NO_BANK, None, '[{"account_id": "suspense", "amount": 4, "total": 4}]')}
        {_receipt(BAD_ACCOUNT, BANK, '[{"account_id": "not-an-account", "amount": 9, "total": 9}]')}
        SELECT public.recalculate_bank_account_balance('{BANK}');
    """)
    before = query(f"SELECT current_balance FROM public.bank_accounts WHERE id = '{BANK}'")

    apply_sql_files([m for m in migration_files() if m.name >= B3_RECEIPTS])

    statuses = dict(query(
        "SELECT d.id, s.key FROM public.documents d JOIN public.document_statuses s ON s.id = d.status_id"
        " JOIN public.document_types t ON t.id = d.document_type_id AND t.key = 'receipt'"))
    assert statuses == {GOOD: "posted", SUSPENSE: "posted", NO_BANK: "draft", BAD_ACCOUNT: "draft",
                        BAD_CONTACT: "draft"}
    assert before == [["181.0000"]]  # 100 + 35 + 30 + 9 + 7
    ledger = query(f"SELECT sum(debit - credit) FROM public.journal_lines WHERE bank_account_id = '{BANK}'")
    assert ledger == [["165.0000"]]  # 181 - the drafts on this account (9 + 7)
    assert query(f"SELECT sum(debit) FROM public.journal_lines l JOIN public.journal_entries e"
                 f" ON e.id = l.journal_entry_id WHERE e.document_id = '{GOOD}'") == [["35.0000"]]
    assert query("SELECT count(*) FROM information_schema.columns WHERE table_name = 'bank_accounts'"
                 " AND column_name IN ('current_balance', 'opening_balance')") == [["0"]]
