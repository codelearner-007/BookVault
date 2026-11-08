"""Delete leftover end-to-end test accounts (and their businesses) from a local database.

  python -m scripts.cleanup_test_accounts                 # dry run: lists what would go
  python -m scripts.cleanup_test_accounts --yes           # pg_dump backup, then delete

Only accounts whose email ends in one of TEST_DOMAINS are touched. Each business such an
account owns goes through the audited purge path (moved to Trash, then
public.purge_business() as that owner, which deletes every business row and writes the
platform audit row "business_purged"); then the account itself is deleted and a platform
audit row "test_account_deleted" is written. An account that is a member of a business owned
by a non-test account is skipped and reported (removing it there is not this script's call).

Environment:
  CLEANUP_DATABASE_URL  admin connection (default: local Supabase postgres on 55322)
  BACKUP_DIR            where the pg_dump goes (required with --yes; outside the repo)
  PG_DOCKER_CONTAINER   see scripts.db_backup (the backup uses it)
"""

from __future__ import annotations

import argparse
import asyncio
import os
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from scripts import db_backup

TEST_DOMAINS = ("e2e.bookvault.dev", "bookvault-test.dev")
DEFAULT_URL = "postgresql+asyncpg://postgres:postgres@127.0.0.1:55322/postgres"
BACKUP_LABEL = "cleanup_test_accounts"
REQUEST_ID = "cleanup_test_accounts"

_ACCOUNTS = text("""
    SELECT CAST(u.id AS text) AS id, u.email
    FROM auth.users u
    WHERE lower(split_part(u.email, '@', 2)) = ANY(CAST(:domains AS text[]))
    ORDER BY u.created_at
""")
_OWNED = text("""
    SELECT CAST(b.id AS text) AS id, b.name FROM public.businesses b WHERE b.owner_id = CAST(:user_id AS uuid)
""")
# Memberships in businesses whose owner is not itself a test account.
_FOREIGN_MEMBERSHIPS = text("""
    SELECT count(*) FROM public.business_members m
    JOIN public.businesses b ON b.id = m.business_id
    JOIN auth.users o ON o.id = b.owner_id
    WHERE m.user_id = CAST(:user_id AS uuid)
      AND lower(split_part(o.email, '@', 2)) <> ALL(CAST(:domains AS text[]))
""")
_TRASH = text("UPDATE public.businesses SET deleted_at = now() WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL")
_ACT_AS = text("SELECT set_config('app.user_id', :user_id, true)")
_PURGE = text("SELECT public.purge_business(CAST(:id AS uuid), CAST(:user_id AS uuid), :name, :request_id)")
_DELETE_USER = text("DELETE FROM auth.users WHERE id = CAST(:user_id AS uuid)")
_AUDIT = text("""
    INSERT INTO public.audit_logs (scope, user_id, action, entity_type, entity_id, details, request_id)
    VALUES ('platform', NULL, 'test_account_deleted', 'User', :user_id,
            jsonb_build_object('email', CAST(:email AS text), 'businesses_purged', CAST(:purged AS integer)),
            :request_id)
""")


@dataclass
class Account:
    id: str
    email: str
    businesses: list
    foreign_memberships: int


async def _accounts(conn: AsyncConnection) -> list[Account]:
    found = []
    for row in (await conn.execute(_ACCOUNTS, {"domains": list(TEST_DOMAINS)})).all():
        owned = (await conn.execute(_OWNED, {"user_id": row.id})).all()
        foreign = (await conn.execute(_FOREIGN_MEMBERSHIPS, {"user_id": row.id,
                                                             "domains": list(TEST_DOMAINS)})).scalar_one()
        found.append(Account(row.id, row.email, list(owned), foreign))
    return found


async def _delete(conn: AsyncConnection, account: Account) -> None:
    """One transaction per account: purge each owned business as its owner, then the account."""
    async with conn.begin():
        for business in account.businesses:
            await conn.execute(_TRASH, {"id": business.id})
            await conn.execute(_ACT_AS, {"user_id": account.id})
            await conn.execute(text("SET LOCAL ROLE bookvault_api"))
            await conn.execute(_PURGE, {"id": business.id, "user_id": account.id, "name": business.name,
                                        "request_id": REQUEST_ID})
            await conn.execute(text("RESET ROLE"))
        await conn.execute(_DELETE_USER, {"user_id": account.id})
        await conn.execute(_AUDIT, {"user_id": account.id, "email": account.email,
                                    "purged": len(account.businesses), "request_id": REQUEST_ID})


async def run(url: str, apply: bool, backup_db: str) -> int:
    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            accounts = await _accounts(conn)
            await conn.rollback()
            skipped = [a for a in accounts if a.foreign_memberships]
            doomed = [a for a in accounts if not a.foreign_memberships]
            for a in doomed:
                print(f"{'delete' if apply else 'would delete'} {a.email} ({len(a.businesses)} business(es))")
            for a in skipped:
                print(f"skip {a.email}: member of {a.foreign_memberships} business(es) of non-test owners")
            if not apply or not doomed:
                print(f"{len(doomed)} account(s) {'to delete' if not apply else 'deleted'}; "
                      f"{len(skipped)} skipped{'' if apply else ' (dry run: pass --yes to delete)'}")
                return 0
            print(f"backup: {db_backup.dump(backup_db, BACKUP_LABEL)}")
            for account in doomed:
                await _delete(conn, account)
            print(f"{len(doomed)} account(s) deleted; {len(skipped)} skipped")
            return 0
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--yes", action="store_true", help="take the backup and delete (default: dry run)")
    parser.add_argument("--backup-db", default="postgres", help="database name for scripts.db_backup dump")
    args = parser.parse_args()
    url = os.environ.get("CLEANUP_DATABASE_URL", DEFAULT_URL)
    raise SystemExit(asyncio.run(run(url, args.yes, args.backup_db)))


if __name__ == "__main__":
    main()
