"""Golden harness skeleton (B0.1): schema validation, support report, per-fixture gating."""

import pytest

from tests.golden.adapters import adapter_for
from tests.golden.loader import (
    CHECKPOINT_KIND,
    DOCUMENT_KIND,
    bookvault_setup_records,
    fixtures_of_kind,
    load_golden_file,
)

EXPECTED_DOCUMENTS = 105
EXPECTED_CHECKPOINTS = 6

DOCUMENTS = fixtures_of_kind(DOCUMENT_KIND)
CHECKPOINTS = fixtures_of_kind(CHECKPOINT_KIND)


def _supported(fixture: dict) -> bool:
    return adapter_for(fixture["document"]["type"]) is not None


def test_golden_fixtures_v2_valid_against_schema():
    assert load_golden_file()["fixtures"]


def test_golden_fixture_counts_match_schedule():
    assert (len(DOCUMENTS), len(CHECKPOINTS)) == (EXPECTED_DOCUMENTS, EXPECTED_CHECKPOINTS)


def test_manager_only_setup_records_are_skipped():
    records = [{"kind": "inventory_unit_cost", "manager_only": True}, {"kind": "price"}]
    assert bookvault_setup_records(records) == [{"kind": "price"}]


def test_golden_support_report(capsys):
    supported = sum(_supported(f) for f in DOCUMENTS)
    with capsys.disabled():
        print(
            f"\n[golden] {supported} of {len(DOCUMENTS)} document fixtures supported, "
            f"0 of {len(CHECKPOINTS)} checkpoints runnable"
        )


@pytest.mark.parametrize("fixture", DOCUMENTS, ids=[f["id"] for f in DOCUMENTS])
def test_golden_document_fixture(fixture):
    if not _supported(fixture):
        pytest.skip(f"not yet supported: {fixture['document']['type']}")
    pytest.fail("adapter registered but the journal-line comparator lands in B1")


@pytest.mark.parametrize("checkpoint", CHECKPOINTS, ids=[c["id"] for c in CHECKPOINTS])
def test_golden_report_checkpoint(checkpoint):
    pytest.skip("not yet supported: report checkpoints run once their fixtures are (B1+)")
