---
name: local-migration-apply
description: How migrations are applied to the local Supabase DB in BookVault (CLI migration up is broken by config.toml)
metadata:
  type: project
---

`npx supabase migration up` fails locally ("[inbucket] ... no longer supported" in supabase/config.toml). B0.2 and B0.3 migrations were applied with `docker exec -i supabase_db_BookVault psql -U postgres -d postgres` inside BEGIN/COMMIT, plus an `INSERT INTO supabase_migrations.schema_migrations (version, name)` row per file.

**Why:** the CLI version rejects the repo's config.toml; fixing config.toml was out of scope.
**How to apply:** use the same psql + history-row pattern; tests build `bookvault_test` themselves (tests/support/test_db.py), and any new trigger we add on `auth.*` must be added to `_DUMP_SKIP_MARKERS` there, because the harness copies the auth schema from the dev DB.
