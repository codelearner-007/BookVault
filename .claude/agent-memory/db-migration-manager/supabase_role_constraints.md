---
name: supabase-role-constraints
description: Non-obvious Postgres role/RLS constraints on local Supabase (postgres not superuser) hit while building B0.4 tenant RLS and the bookvault_api role
metadata:
  type: project
---

Local Supabase `postgres` is NOT superuser (has BYPASSRLS + CREATEROLE). Consequences learned in B0.4 (2026-11-08):
- `ALTER ROLE x NOSUPERUSER ...` fails even when only restating NO-attributes; set attributes in CREATE ROLE only.
- Changing a function owner to a role needs `GRANT <role> TO postgres WITH INHERIT FALSE, SET TRUE`, CREATE on the schema for the new owner (grant, alter, revoke), and every GRANT/ALTER on that function BEFORE the owner change (postgres cannot touch it afterwards).
- `auth.users` has RLS enabled with no policies: a non-bypass role sees 0 rows. The API reads it via `private.accounts` view (postgres-owned, filtered).
- After a `SET LOCAL app.user_id` transaction ends, `current_setting('app.user_id', true)` is '' (not NULL) on that connection; always `NULLIF(...,'')::uuid` (`public.app_user_id()`).
- `current_setting('role')` is 'none' for a direct login; role checks in SECURITY DEFINER triggers must fall back to `session_user`.
- Roles are cluster-wide: the pytest DB `bookvault_test` shares them, so role DDL must be idempotent.

**Why:** these broke migration application or silently weakened checks.
**How to apply:** any new migration touching roles, function ownership, auth schema or RLS context. Every new table must GRANT bookvault_api explicitly and add `<table>_api_*` policies (catalog tests in backend/tests/rls/test_rls_api_role.py enforce FORCE RLS and per-command policies).
