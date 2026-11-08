"""Golden harness: schema validation, support report and the per-fixture runner (B0.1, B1).

A supported fixture runs on a fresh test business (runner.business_creation) after its
depends_on closure, in file order; fixture-scoped settings are restored afterwards
through the audited path (runner.settings_lifetime).
"""

import pytest

from tests.golden.adapters import GoldenRun, adapter_for, runner_supports
from tests.golden.comparator import (
    actual_lines,
    assert_entry_groups_balanced,
    assert_rejection,
    expected_lines,
    unmatched,
)
from tests.golden.loader import (
    CHECKPOINT_KIND,
    DOCUMENT_KIND,
    bookvault_setup_records,
    fixtures_of_kind,
    load_golden_file,
)
from tests.support.factories import create_business
from tests.support.ledger import SIDE_TO_TYPE, biz, create_account, set_lock_date

TEARDOWN_REASON = "golden-fixture teardown"

EXPECTED_DOCUMENTS = 105
EXPECTED_CHECKPOINTS = 6

DOCUMENTS = fixtures_of_kind(DOCUMENT_KIND)
CHECKPOINTS = fixtures_of_kind(CHECKPOINT_KIND)


def _supported(fixture: dict) -> bool:
    return runner_supports(fixture)


def test_golden_fixtures_v2_valid_against_schema():
    assert load_golden_file()["fixtures"]


def test_golden_fixture_counts_match_schedule():
    assert (len(DOCUMENTS), len(CHECKPOINTS)) == (EXPECTED_DOCUMENTS, EXPECTED_CHECKPOINTS)


def test_manager_only_setup_records_are_skipped():
    records = [{"kind": "inventory_unit_cost", "manager_only": True}, {"kind": "price"}]
    assert bookvault_setup_records(records) == [{"kind": "price"}]


def test_b1_schedule_is_runnable():
    assert {f["id"] for f in RUNNABLE} == B1_FIXTURES


def test_golden_support_report(capsys):
    supported = sum(_supported(f) for f in DOCUMENTS)
    with capsys.disabled():
        print(
            f"\n[golden] {supported} of {len(DOCUMENTS)} document fixtures supported, "
            f"0 of {len(CHECKPOINTS)} checkpoints runnable"
        )


def _closure(fixture: dict) -> list[dict]:
    """The fixture and every fixture it depends on (transitively), in file order."""
    everything = load_golden_file()["fixtures"]
    by_id = {f["id"]: f for f in everything}
    wanted, stack = set(), [fixture["id"]]
    while stack:
        fid = stack.pop()
        if fid not in wanted:
            wanted.add(fid)
            stack.extend(by_id[fid].get("depends_on", []))
    return [f for f in everything if f["id"] in wanted]


async def _new_run(client, users) -> GoldenRun:
    owner = await users.create("admin")
    business = await create_business(client, owner, load_golden_file()["runner"]["business_creation"]["name"])
    run = GoldenRun(client, owner, business["id"])
    start = load_golden_file()["runner"]["business_creation"]["books_start_date"]
    await set_lock_date(client, owner, run.business_id, None, books_start_date=start)
    return run


async def _setup_accounts(run: GoldenRun, fixture: dict) -> None:
    accounts = load_golden_file()["accounts"]
    for key in fixture.get("setup", {}).get("accounts", []):
        if key not in run.accounts:
            spec = accounts[key]
            run.accounts[key] = await create_account(
                run.client, run.owner, run.business_id, spec["manager_name"], SIDE_TO_TYPE[spec["side"]]
            )


def _lock_setting(fixture: dict) -> dict | None:
    settings = bookvault_setup_records(fixture.get("setup", {}).get("settings", []))
    return next((s for s in settings if s["key"] == "lock_date"), None)


async def _document_count(run: GoldenRun) -> int:
    response = await run.client.get(biz(run.business_id, "/journal-entries"), headers=run.owner.headers)
    return response.json()["total"]


async def _run_fixture(run: GoldenRun, fixture: dict) -> None:
    await _setup_accounts(run, fixture)
    lock = _lock_setting(fixture)
    if lock and lock["value"]["enabled"]:
        await set_lock_date(run.client, run.owner, run.business_id, lock["value"]["date"])
    try:
        before = await _document_count(run)
        outcome = await adapter_for(fixture["document"]["type"])(run, fixture)
        if fixture["bookvault_expected"]["outcome"] == "rejected":
            assert_rejection(fixture, outcome.status_code, outcome.body)
            assert await _document_count(run) == before, "a rejected fixture stored a document"
            return
        assert outcome.status_code == 201, outcome.body
        actual = actual_lines(outcome.entries, run.account_key, lambda e: e["entry_date"])
        missing, extra = unmatched(expected_lines(fixture), actual)
        assert (missing, extra) == ([], []), f"{fixture['id']}: missing {missing}, unexpected {extra}"
        assert_entry_groups_balanced(outcome.entries)
    finally:
        if lock and lock.get("scope") == "fixture":
            await set_lock_date(run.client, run.owner, run.business_id, None, reason=TEARDOWN_REASON)


def _runnable(fixture: dict) -> bool:
    return all(_supported(f) for f in _closure(fixture))


RUNNABLE = [f for f in DOCUMENTS if _runnable(f)]
B1_FIXTURES = {"T30", "T96a", "T96"}
NOT_YET = [f for f in DOCUMENTS if not _runnable(f)]


@pytest.mark.parametrize("fixture", NOT_YET, ids=[f["id"] for f in NOT_YET])
def test_golden_document_fixture_not_yet_supported(fixture):
    pytest.skip(f"not yet supported: {fixture['document']['type']} (adapter or setup of a later phase)")


@pytest.mark.parametrize("fixture", RUNNABLE, ids=[f["id"] for f in RUNNABLE])
async def test_golden_document_fixture(fixture, client, users):
    run = await _new_run(client, users)
    for step in _closure(fixture):
        await _run_fixture(run, step)


@pytest.mark.parametrize("checkpoint", CHECKPOINTS, ids=[c["id"] for c in CHECKPOINTS])
def test_golden_report_checkpoint(checkpoint):
    pytest.skip("not yet supported: report checkpoints run once their fixtures are (B1+)")
