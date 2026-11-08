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


def test_b1_to_b3_schedule_is_runnable():
    assert {f["id"] for f in RUNNABLE} == B1_FIXTURES | B2_FIXTURES | B3_FIXTURES


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


def _tree_nodes(nodes: list[dict]):
    for node in nodes:
        yield node
        yield from _tree_nodes(node["groups"])


async def _chart(run: GoldenRun) -> list[dict]:
    response = await run.client.get(biz(run.business_id, "/chart-of-accounts/tree?as_at=2100-12-31&include_hidden=true"),
                                    headers=run.owner.headers)
    return list(_tree_nodes(response.json()["roots"]))


async def _setup_groups(run: GoldenRun, fixture: dict) -> None:
    """Groups under the root of their statement (P&L groups of the fixtures hold expenses)."""
    specs = load_golden_file()["master_data"]["account_groups"]
    for key in fixture.get("setup", {}).get("account_groups", []):
        if key in run.groups:
            continue
        spec = specs[key]
        root = next(n for n in await _chart(run) if n["root_key"] == STATEMENT_ROOT[spec["statement"]])
        response = await run.client.post(biz(run.business_id, "/chart-of-accounts/groups"), headers=run.owner.headers,
                                         json={"name": spec["name"], "type": spec["statement"],
                                               "parent_group_id": root["id"]})
        assert response.status_code == 201, response.text
        run.groups[key] = response.json()["id"]


def _group_of(run: GoldenRun, spec: dict) -> str | None:
    """The setup group whose name the account's note names (T95: 'In P&L group ...')."""
    groups = load_golden_file()["master_data"]["account_groups"]
    return next((gid for key, gid in run.groups.items() if groups[key]["name"] in spec.get("note", "")), None)


async def _setup_accounts(run: GoldenRun, fixture: dict) -> None:
    """Seeded system accounts are looked up by their system type; others are created."""
    accounts = load_golden_file()["accounts"]
    for key in fixture.get("setup", {}).get("accounts", []):
        if key in run.accounts:
            continue
        spec = accounts[key]
        if spec.get("system_account_type"):
            run.accounts[key] = next(
                a["id"] for n in await _chart(run) for a in n["accounts"]
                if a["system_account_code"] == spec["system_account_type"])
            continue
        run.accounts[key] = await create_account(
            run.client, run.owner, run.business_id, spec["manager_name"], SIDE_TO_TYPE[spec["side"]],
            group_id=_group_of(run, spec),
        )


async def _setup_banks(run: GoldenRun, fixture: dict) -> None:
    specs = load_golden_file()["master_data"]["bank_accounts"]
    for key in fixture.get("setup", {}).get("bank_accounts", []):
        if key in run.banks:
            continue
        pending = specs[key].get("can_have_pending_transactions", False)
        response = await run.client.post(biz(run.business_id, "/bank-accounts"), headers=run.owner.headers,
                                         json={"name": specs[key]["name"], "can_have_pending": pending})
        assert response.status_code == 201, response.text
        run.banks[key] = response.json()["id"]
        if pending:
            run.pending_banks.add(key)


async def _setup_parties(run: GoldenRun, fixture: dict) -> None:
    """Capital accounts only in B3 (runner_supports keeps other kinds for their phase)."""
    specs = load_golden_file()["master_data"]["parties"]
    for key in fixture.get("setup", {}).get("parties", []):
        if key in run.parties:
            continue
        response = await run.client.post(biz(run.business_id, "/capital-accounts"), headers=run.owner.headers,
                                         json={"name": specs[key]["name"]})
        assert response.status_code == 201, response.text
        run.parties[key] = response.json()["id"]


def _lock_setting(fixture: dict) -> dict | None:
    settings = bookvault_setup_records(fixture.get("setup", {}).get("settings", []))
    return next((s for s in settings if s["key"] == "lock_date"), None)


DOCUMENT_LISTS = ("/journal-entries", "/receipts", "/payments", "/inter-account-transfers")


async def _document_count(run: GoldenRun) -> int:
    total = 0
    for path in DOCUMENT_LISTS:
        response = await run.client.get(biz(run.business_id, path), headers=run.owner.headers)
        total += response.json()["total"]
    return total


def _assert_one_opening_entry(fixture: dict, entries: list[dict]) -> None:
    """runner.comparison.entry_checks: one opening entry per expected opening source record."""
    if any(x.get("entry") == "opening" for x in expected_lines(fixture)):
        assert [e["source"] for e in entries].count("opening") == 1, entries


def _assert_actions(fixture: dict, actions: list[dict]) -> None:
    expected = fixture["bookvault_expected"].get("action_outcomes", [])
    got = {a["seq"]: a["status_code"] for a in actions}
    for outcome in expected:
        status = got[outcome["seq"]]
        if outcome["outcome"] == "rejected":
            assert status == outcome.get("http_status", status) and status >= 400, (outcome, status)
        else:
            assert status < 300, (outcome, status)


async def _run_fixture(run: GoldenRun, fixture: dict) -> None:
    await _setup_groups(run, fixture)
    await _setup_accounts(run, fixture)
    await _setup_banks(run, fixture)
    await _setup_parties(run, fixture)
    lock = _lock_setting(fixture)
    if lock and lock["value"]["enabled"]:
        await set_lock_date(run.client, run.owner, run.business_id, lock["value"]["date"])
    try:
        before = await _document_count(run)
        outcome = await adapter_for(fixture["document"]["type"])(run, fixture)
        expected = fixture["bookvault_expected"].get("outcome") or fixture["manager_observed"]["outcome"]
        if expected == "rejected":
            assert_rejection(fixture, outcome.status_code, outcome.body)
            assert await _document_count(run) == before, "a rejected fixture stored a document"
            return
        assert outcome.status_code == 201, outcome.body
        actual = actual_lines(outcome.entries, run.account_key, lambda e: e["entry_date"], run.dimensions)
        missing, extra = unmatched(expected_lines(fixture), actual)
        assert (missing, extra) == ([], []), f"{fixture['id']}: missing {missing}, unexpected {extra}"
        assert_entry_groups_balanced(outcome.entries)
        _assert_one_opening_entry(fixture, outcome.entries)
        _assert_actions(fixture, outcome.actions)
    finally:
        if lock and lock.get("scope") == "fixture":
            await set_lock_date(run.client, run.owner, run.business_id, None, reason=TEARDOWN_REASON)


def _runnable(fixture: dict) -> bool:
    return all(_supported(f) for f in _closure(fixture))


RUNNABLE = [f for f in DOCUMENTS if _runnable(f)]
B1_FIXTURES = {"T30", "T96a", "T96"}
B2_FIXTURES = {"T36", "T95"}
B3_FIXTURES = {"T01", "T02", "T03", "T08", "T31", "T41", "T64", "T65", "T67", "T74", "T83", "T84", "T85"}
STATEMENT_ROOT = {"pl": "expenses", "balance_sheet": "assets"}
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
