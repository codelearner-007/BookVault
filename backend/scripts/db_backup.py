"""Backup and restore for destructive migrations (runbook: docs/runbooks/backup-restore.md).

  python -m scripts.db_backup dump    --db postgres --label 20261108000018_purge_business
  python -m scripts.db_backup verify  --file <dump>
  python -m scripts.db_backup restore --db postgres --file <dump> [--clean]
  python -m scripts.db_backup prune

--db is a database name inside the Postgres container PG_DOCKER_CONTAINER (local Supabase),
or a full connection URL when PG_DOCKER_CONTAINER is empty (pg_dump/pg_restore on PATH).
Dumps go to BACKUP_DIR (outside the repo) as <label>_<UTC timestamp>.dump, with the
SHA-256 next to it in <file>.sha256. Old dumps are pruned after BACKUP_RETENTION_DAYS.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

CONTAINER = os.environ.get("PG_DOCKER_CONTAINER", "supabase_db_BookVault")
PG_USER = os.environ.get("PG_ADMIN_USER", "postgres")
RETENTION_DAYS = int(os.environ.get("BACKUP_RETENTION_DAYS", "30"))
# Roles that own functions (ALTER ... OWNER needs CREATE on the schema while restoring).
FUNCTION_OWNER_ROLES = ("bookvault_rls_owner", "bookvault_purge")
SECONDS_PER_DAY = 86400


def _backup_dir() -> Path:
    path = os.environ.get("BACKUP_DIR")
    if not path:
        raise SystemExit("BACKUP_DIR is not set (use a directory outside the repository)")
    return Path(path)


def _command(tool: str, db: str, *args: str) -> list[str]:
    if CONTAINER:
        return ["docker", "exec", "-i", CONTAINER, tool, "-U", PG_USER, "-d", db, *args]
    return [tool, "-d", db, *args]


def _run(command: list[str], stdin: bytes | None = None) -> bytes:
    result = subprocess.run(command, input=stdin, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(f"{command[0]} failed: {result.stderr.decode(errors='replace')[-2000:]}")
    return result.stdout


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _psql(db: str, sql: str) -> None:
    _run(_command("psql", db, "-q", "-v", "ON_ERROR_STOP=1", "-c", sql))


def dump(db: str, label: str, backup_dir: Path | None = None) -> Path:
    """pg_dump -Fc of the database; returns the dump path (checksum written next to it)."""
    directory = backup_dir or _backup_dir()
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = directory / f"{label}_{stamp}.dump"
    path.write_bytes(_run(_command("pg_dump", db, "-Fc")))
    Path(f"{path}.sha256").write_text(f"{_sha256(path)}  {path.name}\n", encoding="utf-8")
    return path


def verify(path: Path) -> None:
    """The dump still matches the checksum recorded when it was taken."""
    expected = Path(f"{path}.sha256").read_text(encoding="utf-8").split()[0]
    if _sha256(path) != expected:
        raise RuntimeError(f"checksum mismatch for {path.name}")


def restore(db: str, path: Path, clean: bool = False) -> None:
    """pg_restore into `db` (an existing, empty database, or the source with clean=True)."""
    verify(path)
    owners = ", ".join(FUNCTION_OWNER_ROLES)
    _psql(db, f"GRANT CREATE ON SCHEMA public TO {owners}")
    try:
        options = ["--exit-on-error", *(["--clean", "--if-exists"] if clean else [])]
        _run(_command("pg_restore", db, *options), stdin=path.read_bytes())
    finally:
        _psql(db, f"REVOKE CREATE ON SCHEMA public FROM {owners}")


def prune(backup_dir: Path | None = None, retention_days: int = RETENTION_DAYS) -> list[Path]:
    """Delete dumps (and their checksums) older than the retention window."""
    cutoff = time.time() - retention_days * SECONDS_PER_DAY
    removed = [p for p in (backup_dir or _backup_dir()).glob("*.dump") if p.stat().st_mtime < cutoff]
    for path in removed:
        path.unlink()
        Path(f"{path}.sha256").unlink(missing_ok=True)
    return removed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    dump_cmd = commands.add_parser("dump")
    dump_cmd.add_argument("--db", required=True)
    dump_cmd.add_argument("--label", required=True, help="migration file name without .sql")
    verify_cmd = commands.add_parser("verify")
    verify_cmd.add_argument("--file", required=True, type=Path)
    restore_cmd = commands.add_parser("restore")
    restore_cmd.add_argument("--db", required=True)
    restore_cmd.add_argument("--file", required=True, type=Path)
    restore_cmd.add_argument("--clean", action="store_true", help="restore over the same database")
    commands.add_parser("prune")
    args = parser.parse_args()

    if args.command == "dump":
        print(dump(args.db, args.label))
    elif args.command == "verify":
        verify(args.file)
        print("OK")
    elif args.command == "restore":
        restore(args.db, args.file, args.clean)
        print("restored")
    else:
        print(f"removed {len(prune())} dump(s)")


if __name__ == "__main__":
    main()
