---
name: ledger-test-gotchas
description: Why ledger data migrations need BEGIN/COMMIT and why pytest never runs the deferred balance check (B3 lessons)
metadata:
  type: project
---

- The test harness (`tests/support/test_db.py`) applies each migration file with psql autocommit, so a data migration that inserts journal_entries and journal_lines in separate statements fails the deferred balance trigger unless the file wraps itself in `BEGIN; ... COMMIT;` (20261108000032 does).
- API tests run inside one rolled-back transaction (conftest `db_conn`), so the deferred balance and reversal checks never fire in pytest; only migration tests and `committed`-marked tests reach COMMIT.
- In SQL, guard a text->uuid cast with `CASE WHEN x ~ uuid_regex THEN x::uuid END`, never `AND x ~ regex AND col = x::uuid` (PG may evaluate the cast first; it failed on the 'suspense' marker only on a fresh DB).

**Why:** each cost a debugging round in B3.
**How to apply:** any future migration that posts ledger rows or casts legacy text ids (B4 receipts drop, B5 suppliers, etc.). See [[local-migration-apply]].
