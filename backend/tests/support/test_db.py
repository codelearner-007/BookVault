"""Build the isolated test database from supabase/migrations (test mode T).

The test database is a separate database (default ``bookvault_test``) inside the
local Supabase Postgres container. It is never the development database:

1. drop + create the test database;
2. copy the *schema only* of the Supabase-owned ``auth`` and ``storage`` schemas
   from the dev database (no rows), so migrations that reference ``auth.users``
   or ``storage.buckets`` apply exactly as on Supabase;
3. replicate Supabase's default privileges on ``public`` (anon/authenticated get
   ALL), so privilege tests see what production sees before our revokes;
4. apply every migration in filename order, then the seed files.

GoTrue and PostgREST do not run against this database, so tests that need them
(mode C GoTrue tests, B0.7) wait for the separate test stack.

Run directly:  python -m tests.support.test_db
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"
SEED_FILES = [
    REPO_ROOT / "supabase" / "seeds" / "rbac_seed.sql",
    REPO_ROOT / "supabase" / "seeds" / "admin_tabs_seed.sql",
]

CONTAINER = os.environ.get("TEST_DB_CONTAINER", "supabase_db_BookVault")
SOURCE_DB = os.environ.get("TEST_DB_SOURCE", "postgres")
TEST_DB = os.environ.get("TEST_DB_NAME", "bookvault_test")
DB_USER = os.environ.get("TEST_DB_USER", "postgres")

# Supabase's stock grants on the public schema (mirrors pg_default_acl on a fresh project).
_SUPABASE_PUBLIC_DEFAULTS = """
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
"""

_EXTENSIONS = """
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
"""

# Lines of the auth/storage dump that belong to our migrations, not to Supabase.
_DUMP_SKIP_MARKERS = (
    "on_auth_user_created",
    "on_auth_user_bootstrap_check",
    "receipts_bucket_service_role_all",
)


def _docker(*args: str, stdin: str | None = None) -> str:
    result = subprocess.run(
        ["docker", "exec", "-i", CONTAINER, *args],
        input=stdin,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        raise RuntimeError(f"{' '.join(args[:4])} failed:\n{result.stderr[-2000:]}")
    return result.stdout


def _psql(database: str, sql: str) -> None:
    _docker("psql", "-U", DB_USER, "-d", database, "-q", "-v", "ON_ERROR_STOP=1", stdin=sql)


def _supabase_schema_dump() -> str:
    dump = _docker(
        "pg_dump", "-U", DB_USER, "--schema-only", "--no-owner", "--no-privileges",
        "-n", "auth", "-n", "storage", SOURCE_DB,
    )
    return "\n".join(
        line for line in dump.splitlines() if not any(m in line for m in _DUMP_SKIP_MARKERS)
    )


def migration_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


def apply_sql_files(paths: list[Path]) -> None:
    for path in paths:
        try:
            _psql(TEST_DB, path.read_text(encoding="utf-8"))
        except RuntimeError as exc:
            raise RuntimeError(f"Applying {path.name} failed: {exc}") from exc


def run_sql(sql: str) -> None:
    """Run SQL against the test database (committed)."""
    _psql(TEST_DB, sql)


def query(sql: str) -> list[list[str]]:
    """Return rows of a query on the test database as lists of strings."""
    out = _docker("psql", "-U", DB_USER, "-d", TEST_DB, "-At", "-F", "|", "-c", sql)
    return [line.split("|") for line in out.splitlines() if line]


def build_test_database(stop_before: str | None = None) -> None:
    """Recreate the test database from scratch (mode T reset).

    With stop_before, only migrations whose filename sorts before it are applied
    (and no seeds), so a test can load data and then apply the rest.
    """
    if TEST_DB == SOURCE_DB:
        raise RuntimeError("TEST_DB_NAME must differ from the development database")
    _psql(SOURCE_DB, f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE);')
    _psql(SOURCE_DB, f'CREATE DATABASE "{TEST_DB}";')
    _psql(TEST_DB, f'ALTER DATABASE "{TEST_DB}" SET search_path = "$user", public, extensions;')
    _psql(TEST_DB, _EXTENSIONS)
    _psql(TEST_DB, _supabase_schema_dump())
    _psql(TEST_DB, _SUPABASE_PUBLIC_DEFAULTS)
    if stop_before is None:
        apply_sql_files([*migration_files(), *SEED_FILES])
    else:
        apply_sql_files([m for m in migration_files() if m.name < stop_before])


if __name__ == "__main__":
    build_test_database()
    print(f"Built {TEST_DB} from {len(migration_files())} migrations")
