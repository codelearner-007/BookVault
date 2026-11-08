"""Golden fixture loader: validates golden-fixtures.v2.json against its JSON Schema first.

Nothing runs on an invalid file: `load_golden_file()` raises, which fails collection.
"""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path

import jsonschema

SPEC_DIR = Path(__file__).resolve().parents[3] / "backend-ref" / "manager-io"
FIXTURES_FILE = SPEC_DIR / "golden-fixtures.v2.json"
SCHEMA_FILE = SPEC_DIR / "golden-fixtures.schema.json"

DOCUMENT_KIND = "document"
CHECKPOINT_KIND = "report_checkpoint"


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@cache
def load_golden_file() -> dict:
    """Return the fixtures file after validating it against the schema (raises if invalid)."""
    data = _read(FIXTURES_FILE)
    jsonschema.Draft202012Validator(_read(SCHEMA_FILE)).validate(data)
    return data


def fixtures_of_kind(kind: str) -> list[dict]:
    return [f for f in load_golden_file()["fixtures"] if f["kind"] == kind]


def bookvault_setup_records(records: list[dict]) -> list[dict]:
    """Setup records the BookVault runner applies: `manager_only` ones are skipped (runner.dated_records)."""
    return [r for r in records if not r.get("manager_only", False) and r.get("applies_to") != "manager_only"]
