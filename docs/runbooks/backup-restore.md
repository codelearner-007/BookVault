# Backup and restore runbook

Follow this for every destructive or data-rewriting migration: `DROP`, type changes, new
uniques over existing data, backfills, column drops, key renames (build plan B0.8).

Tool: `backend/scripts/db_backup.py` (run from `backend/`). Environment:

| Variable | Meaning |
|---|---|
| `BACKUP_DIR` | Where dumps go. Must be outside the repository. Required. |
| `PG_DOCKER_CONTAINER` | Local Postgres container (default `supabase_db_BookVault`). Set it to an empty value to use `pg_dump`/`pg_restore` on `PATH`; `--db` is then a connection URL. |
| `PG_ADMIN_USER` | Database user for the container tools (default `postgres`). |
| `BACKUP_RETENTION_DAYS` | `prune` deletes dumps older than this (default 30). |

## 1. Pre-checks

Each destructive migration has a pre-check in `supabase/prechecks/<migration>.sql`. It must
return zero rows. The migration's first `DO` block runs the same check and raises, so a
failing check changes nothing.

```bash
docker exec -i supabase_db_BookVault psql -U postgres -d postgres \
  < supabase/prechecks/<migration>.sql
```

If rows come back, fix the data first. For duplicate references or codes, list them for the
user, who renames them or approves an automatic " (2)" suffix. Then run the check again.

## 2. Backup

Run this right before the migration:

```bash
cd backend
BACKUP_DIR=/srv/bookvault-backups python -m scripts.db_backup dump \
  --db postgres --label <migration file name without .sql>
```

This writes `<label>_<UTC timestamp>.dump` (`pg_dump -Fc`) and `<file>.sha256`. Link the
file name in the migration PR. Run `python -m scripts.db_backup prune` to apply retention.

## 3. Apply

Apply the migration, then run the full backend suite:

```bash
backend/venv/Scripts/python.exe -m pytest
```

## 4. Rollback

- **Schema:** follow the migration's `ROLLBACK` comment.
- **Data:** restore the dump over the same database:

```bash
python -m scripts.db_backup verify  --file <dump>
python -m scripts.db_backup restore --db postgres --file <dump> --clean
```

During the restore, `restore` gives the function-owner roles (`bookvault_rls_owner`,
`bookvault_purge`) `CREATE` on `public`, and takes it back afterwards. Without it, the
`ALTER FUNCTION ... OWNER` statements fail, and the SECURITY DEFINER functions would end up
owned by the wrong role. Never use `--no-owner`. The purge bypass and the RLS helpers depend
on who owns those functions.

## 5. Restore drill (tested)

`backend/tests/migrations/test_restore_drill.py::test_restore_drill_matches_source` (mode T)
does the following:

1. Rebuilds the test database and seeds it.
2. Dumps it with the script and verifies the checksum.
3. Restores the dump into a fresh database.
4. Compares the row counts of every `public` and `auth` table, the balances per business,
   and who owns `purge_business`.

The Trial Balance per business and the INV invariants join the comparison once B1 adds the
ledger. Run the drill in CI on every migration PR and once per phase:

```bash
backend/venv/Scripts/python.exe -m pytest tests/migrations/test_restore_drill.py
```

## Permanent business purge

Permanent deletion is not a runbook task. It is the audited in-app path:

- `DELETE /api/v1/businesses/{id}/permanent`, with the body
  `{"confirmation": "<business name>", "export_offered": true}`.
- The caller must be the owner, the business must be in Trash, and the password sign-in
  (plus TOTP when the session is MFA) must be at most `REAUTH_MAX_AGE_SECONDS` old.
- `GET /api/v1/businesses/{id}/export` is the JSON backup the UI offers before the purge.

The request runs `public.purge_business()`, which deletes every business row and writes one
platform audit row (`business_purged`).

A legal deletion request for another tenant's business is a separately approved runbook. It
is not an app feature (D-34).
