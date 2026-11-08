"""Only the posting service writes the shared ledger tables (platform-model §5.2, CLAUDE.md)."""

import ast
from pathlib import Path

APP = Path(__file__).resolve().parents[2] / "app"
WRITER_REPOSITORY = "app.repositories.ledger_repository"
POSTING_PACKAGE = APP / "services" / "posting"
LEDGER_MODELS = {"Document", "DocumentLine", "JournalEntry", "JournalLine"}


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
            names.update(f"{node.module}.{a.name}" for a in node.names)
    return names


def _outside_posting() -> list[Path]:
    return [p for p in APP.rglob("*.py")
            if POSTING_PACKAGE not in p.parents and p.name != "ledger_repository.py"]


def test_ledger_write_repository_is_imported_by_the_posting_service_only():
    offenders = [p for p in _outside_posting() if WRITER_REPOSITORY in _imports(p)]
    assert offenders == []


def test_ledger_models_are_not_constructed_outside_the_posting_service():
    offenders = []
    for path in _outside_posting():
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Call) and getattr(node.func, "id", None) in LEDGER_MODELS:
                offenders.append(f"{path.name}:{node.lineno}")
    assert offenders == []
