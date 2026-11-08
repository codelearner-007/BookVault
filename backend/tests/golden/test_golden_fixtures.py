"""Golden harness: schema validation, support report and the per-fixture runner (B0.1, B1).

A supported fixture runs on a fresh test business (runner.business_creation) after its
depends_on closure, in file order; fixture-scoped settings are restored afterwards
through the audited path (runner.settings_lifetime).
"""

from decimal import Decimal

import httpx

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
from tests.support.ledger import SIDE_TO_TYPE, biz, create_account, set_lock_date, trial_balance

TEARDOWN_REASON = "golden-fixture teardown"

EXPECTED_DOCUMENTS = 107  # v2 + T102, T103 (receipt / payment without a bank account)
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
    records = [{"kind": "inventory_unit_cost", "manager_only": True}, {"kind": "price"},
               {"kind": "inventory_unit_cost", "applies_to": "manager_only"}]
    assert bookvault_setup_records(records) == [{"kind": "price"}]


def test_b1_to_b7_schedule_is_runnable():
    assert {f["id"] for f in RUNNABLE} == (B1_FIXTURES | B2_FIXTURES | B3_FIXTURES | B4_FIXTURES | B5_FIXTURES
                                          | B6_FIXTURES | B7_FIXTURES | BOOKVAULT_ONLY)


def test_golden_support_report(capsys):
    supported = sum(_supported(f) for f in DOCUMENTS)
    with capsys.disabled():
        print(
            f"\n[golden] {supported} of {len(DOCUMENTS)} document fixtures supported, "
            f"{len(RUNNABLE_CHECKPOINTS)} of {len(CHECKPOINTS)} checkpoints runnable"
        )


def _stock_items(fixture: dict) -> set[str]:
    """Inventory items a fixture moves (a kit moves its components)."""
    specs = load_golden_file()["master_data"]["items"]
    keys = set(fixture.get("setup", {}).get("items", []))
    keys |= {c["item"] for k in keys for c in specs[k].get("bill_of_materials", [])}
    return {k for k in keys if specs[k]["kind"] == "inventory"}


def _closure(fixture: dict) -> list[dict]:
    """The fixture and every fixture it depends on (transitively), in file order. Stock is an implicit
    dependency (BV-01): the moving average and the stock a fixture sees come from every earlier fixture
    that moved the same items, so those run first too (T73's 'Widget after T49')."""
    everything = load_golden_file()["fixtures"]
    by_id = {f["id"]: f for f in everything}
    position = {f["id"]: i for i, f in enumerate(everything)}
    wanted, stack = set(), [fixture["id"]]
    while stack:
        fid = stack.pop()
        if fid in wanted:
            continue
        wanted.add(fid)
        stack.extend(by_id[fid].get("depends_on", []))
        if items := _stock_items(by_id[fid]):
            stack.extend(f["id"] for f in everything[:position[fid]]
                         if f["kind"] == DOCUMENT_KIND and _stock_items(f) & items)
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
        if key in run.accounts or accounts[key].get("manager_only"):
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


PARTY_ROUTES = {"capital_account": "/capital-accounts", "customer": "/customers", "supplier": "/suppliers"}


async def _setup_parties(run: GoldenRun, fixture: dict) -> None:
    """Capital accounts (B3) and customers (B4, with their credit limit); other kinds wait for their phase."""
    specs = load_golden_file()["master_data"]["parties"]
    for key in fixture.get("setup", {}).get("parties", []):
        if key in run.parties:
            continue
        spec = specs[key]
        body = {"name": spec["name"], **({"credit_limit": spec["credit_limit"]} if "credit_limit" in spec else {})}
        response = await run.client.post(biz(run.business_id, PARTY_ROUTES[spec["kind"]]), headers=run.owner.headers,
                                         json=body)
        assert response.status_code == 201, response.text
        run.parties[key] = response.json()["id"]


async def _setup_tax_codes(run: GoldenRun, fixture: dict) -> None:
    specs = load_golden_file()["master_data"]["tax_codes"]
    for key in fixture.get("setup", {}).get("tax_codes", []):
        if key in run.tax_codes:
            continue
        spec = specs[key]
        body = {"name": spec["name"], "is_reverse_charge": spec.get("reverse_charge", False)}
        if spec["type"] == "multiple_rates":  # PR-18 BV: a component without an account takes Tax payable
            accounts = [c["account"] for c in spec["components"] if c["account"]]
            await _setup_accounts(run, {"setup": {"accounts": accounts}})
            body["components"] = [{"name": c["name"], "rate": c["rate"],
                                   "account_id": run.accounts[c["account"]] if c["account"] else None}
                                  for c in spec["components"]]
        else:
            body.update(rate=spec["rate"], account_id=run.accounts[spec["account"]])
        response = await run.client.post(biz(run.business_id, "/tax-codes"), headers=run.owner.headers, json=body)
        assert response.status_code == 201, response.text
        run.tax_codes[key] = response.json()["id"]
        for component, stored in zip(spec.get("components", []), response.json()["components"]):
            run.tax_components[component["key"]] = stored["id"]


async def _create_item(run: GoldenRun, spec: dict) -> httpx.Response:
    """Non-inventory items name their income account; inventory items and kits default to Inventory - sales."""
    if spec["kind"] == "inventory":
        return await run.client.post(biz(run.business_id, "/inventory-items"), headers=run.owner.headers,
                                     json={"name": spec["name"], "code": spec.get("code")})
    if spec["kind"] == "kit":
        await _setup_items(run, {"setup": {"items": [c["item"] for c in spec["bill_of_materials"]]}})
        return await run.client.post(biz(run.business_id, "/inventory-kits"), headers=run.owner.headers, json={
            "name": spec["name"], "code": spec.get("code"),
            "components": [{"item_id": run.items[c["item"]], "qty": c["qty"]} for c in spec["bill_of_materials"]]})
    if spec["income_account"] not in run.accounts:
        await _setup_accounts(run, {"setup": {"accounts": [spec["income_account"]]}})
    return await run.client.post(biz(run.business_id, "/non-inventory-items"), headers=run.owner.headers,
                                 json={"name": spec["name"], "income_account_id": run.accounts[spec["income_account"]]})


async def _setup_items(run: GoldenRun, fixture: dict) -> None:
    specs = load_golden_file()["master_data"]["items"]
    for key in fixture.get("setup", {}).get("items", []):
        if key in run.items:
            continue
        response = await _create_item(run, specs[key])
        assert response.status_code == 201, response.text
        run.items[key] = response.json()["id"]
        # Inventory items post COGS and stock to the system accounts (dimension matching needs their keys).
        if specs[key]["kind"] != "non_inventory":
            await _setup_accounts(run, {"setup": {"accounts": ["inventory_on_hand", "inventory_cost",
                                                               "inventory_sales"]}})


async def _setup_locations(run: GoldenRun, fixture: dict) -> None:
    """The default location exists with the business; others are created."""
    specs = load_golden_file()["master_data"]["inventory_locations"]
    for key in fixture.get("setup", {}).get("inventory_locations", []):
        if key in run.locations:
            continue
        listed = (await run.client.get(biz(run.business_id, "/inventory-locations"), headers=run.owner.headers)).json()
        found = next((x["id"] for x in listed["items"] if x["name"] == specs[key]["name"]), None)
        if found is None:
            response = await run.client.post(biz(run.business_id, "/inventory-locations"), headers=run.owner.headers,
                                             json={"name": specs[key]["name"]})
            assert response.status_code == 201, response.text
            found = response.json()["id"]
        run.locations[key] = found


async def _apply_settings(run: GoldenRun, fixture: dict) -> None:
    """BookVault-only sales setting (BUG-05); books_start_date is the runner's (no-op, T68)."""
    for setting in bookvault_setup_records(fixture.get("setup", {}).get("settings", [])):
        if setting["key"] in WHT_SETTINGS:  # B7: the flags only show the form fields (BUG-01)
            path, body = "/settings/withholding-tax", {setting["key"]: setting["value"]}
        elif setting["key"] == "credit_limit_policy":
            path, body = "/settings/sales", {"credit_limit_policy": setting["value"]}
        else:
            continue
        current = (await run.client.get(biz(run.business_id, path), headers=run.owner.headers)).json()
        response = await run.client.put(biz(run.business_id, path), headers=run.owner.headers,
                                        json={"version": current["version"], **body})
        assert response.status_code == 200, response.text


def _lock_setting(fixture: dict) -> dict | None:
    settings = bookvault_setup_records(fixture.get("setup", {}).get("settings", []))
    return next((s for s in settings if s["key"] == "lock_date"), None)


WHT_SETTINGS = {"wht_receivable_enabled", "wht_payable_enabled"}
DOCUMENT_LISTS = ("/journal-entries", "/receipts", "/payments", "/inter-account-transfers", "/sales-invoices",
                  "/credit-notes", "/late-payment-fees", "/purchase-invoices", "/debit-notes", "/inventory-write-offs",
                  "/production-orders")


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
    await _setup_tax_codes(run, fixture)
    await _setup_items(run, fixture)
    await _setup_locations(run, fixture)
    await _apply_settings(run, fixture)
    lock = _lock_setting(fixture)
    if lock and lock["value"]["enabled"]:
        await set_lock_date(run.client, run.owner, run.business_id, lock["value"]["date"])
    try:
        before = await _document_count(run)
        outcome = await adapter_for(fixture["document"]["type"])(run, fixture)
        expected = fixture["bookvault_expected"].get("outcome") or fixture["manager_observed"]["outcome"]
        if expected == "not_applicable":
            return  # T99 BookVault variant: no pending step, the discount already posted (BUG-07)
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
B4_FIXTURES = {"T04", "T05", "T09", "T37", "T42a", "T42b", "T43", "T47", "T56", "T62", "T68a", "T68", "T97", "T98",
               "T99", "T100", "T101"}
B5_FIXTURES = {"T06", "T07", "T63", "T79"}
B6_FIXTURES = {"T10", "T11", "T12", "T13", "T14", "T15", "T16", "T17", "T18", "T19", "T20", "T28", "T29", "T32",
               "T33", "T46", "T48", "T49", "T58", "T69", "T70", "T73a", "T73", "T76"}
B7_FIXTURES = {"T39", "T53", "T54", "T55", "T57", "T77", "T78", "T80", "T81", "T82"}
# BookVault-only rules without a Manager observation (phase_tag "bv"): PR-78 receipt / payment without a bank account.
BOOKVAULT_ONLY = {"T102", "T103"}
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


# ---------------------------------------------------------------- report checkpoints (B5: CP-T09)
CHECKPOINT_METRICS = {"stored_debits_in_period", "stored_debits_cumulative", "retained_earnings_report_line",
                      "net_profit", "account_balance"}
EARLIEST = "1900-01-01"
PAGE = 100


def _before(checkpoint: dict) -> list[dict]:
    """Every fixture before the checkpoint, in file order (runner.execution)."""
    everything = load_golden_file()["fixtures"]
    return everything[:next(i for i, f in enumerate(everything) if f["id"] == checkpoint["id"])]


def _checkpoint_runnable(checkpoint: dict) -> bool:
    figures = checkpoint["bookvault_expected"]["report_checkpoint"]["figures"]
    prior = [f for f in _before(checkpoint) if f["kind"] != CHECKPOINT_KIND]
    return (all(f["kind"] == DOCUMENT_KIND and _supported(f) for f in prior)
            and {m["metric"] for m in figures} <= CHECKPOINT_METRICS)


RUNNABLE_CHECKPOINTS = [c for c in CHECKPOINTS if _checkpoint_runnable(c)]
NOT_YET_CHECKPOINTS = [c for c in CHECKPOINTS if not _checkpoint_runnable(c)]


def test_b6_checkpoints_are_runnable():
    assert [c["id"] for c in RUNNABLE_CHECKPOINTS] == ["CP-T09", "CP-T20"]


async def _stored_debits(run: GoldenRun, date_from: str, date_to: str) -> Decimal:
    total, page = Decimal(0), 1
    while True:
        response = await run.client.get(biz(run.business_id, "/reports/general-ledger-transactions"),
                                        params={"from": date_from, "to": date_to, "page": page, "page_size": PAGE},
                                        headers=run.owner.headers)
        assert response.status_code == 200, response.text
        body = response.json()
        total += sum((Decimal(x["debit"]) for x in body["items"]), Decimal(0))
        if page * PAGE >= body["total"]:
            return total
        page += 1


async def _listed_balance(run: GoldenRun, path: str, record_id: str, field: str) -> Decimal:
    response = await run.client.get(biz(run.business_id, path), params={"page_size": PAGE}, headers=run.owner.headers)
    assert response.status_code == 200, response.text
    return Decimal(next(x[field] for x in response.json()["items"] if x["id"] == record_id))


async def _account_balance(run: GoldenRun, figure: dict, as_at: str) -> Decimal:
    """Dr positive / Cr negative (conventions.signed_values); a dimension reads its sub-ledger."""
    dims = figure.get("dimensions", {})
    if "bank_account" in dims:
        return await _listed_balance(run, "/bank-accounts", run.banks[dims["bank_account"]], "actual_balance")
    if "party" in dims:
        kind = load_golden_file()["master_data"]["parties"][dims["party"]]["kind"]
        return await _listed_balance(run, PARTY_ROUTES[kind], run.parties[dims["party"]], "balance")
    rows = (await trial_balance(run.client, run.owner, run.business_id, as_at))["rows"]
    row = next((r for r in rows if r["account_id"] == run.accounts[figure["account_key"]]), None)
    return Decimal(row["debit"]) - Decimal(row["credit"]) if row else Decimal(0)


async def _figure(run: GoldenRun, figure: dict, report: dict, summary: dict) -> Decimal:
    metric = figure["metric"]
    if metric == "stored_debits_in_period":
        return await _stored_debits(run, report["period"]["from"], report["period"]["to"])
    if metric == "stored_debits_cumulative":
        return await _stored_debits(run, EARLIEST, report["as_at"])
    if metric == "net_profit":
        return Decimal(summary["profit_and_loss"]["net_profit"])
    if metric == "retained_earnings_report_line":
        return -Decimal(summary["retained_earnings"]["cumulative_profit"])  # Dr positive
    return await _account_balance(run, figure, report["as_at"])


@pytest.mark.parametrize("checkpoint", NOT_YET_CHECKPOINTS, ids=[c["id"] for c in NOT_YET_CHECKPOINTS])
def test_golden_report_checkpoint_not_yet_supported(checkpoint):
    pytest.skip("not yet supported: a fixture or metric before this checkpoint belongs to a later phase")


@pytest.mark.parametrize("checkpoint", RUNNABLE_CHECKPOINTS, ids=[c["id"] for c in RUNNABLE_CHECKPOINTS])
async def test_golden_report_checkpoint(checkpoint, client, users):
    run = await _new_run(client, users)
    for fixture in _before(checkpoint):
        if fixture["kind"] == DOCUMENT_KIND:
            await _run_fixture(run, fixture)
    report = checkpoint["bookvault_expected"]["report_checkpoint"]
    response = await run.client.get(biz(run.business_id, "/reports/summary"), headers=run.owner.headers,
                                    params={"from": report["period"]["from"], "to": report["period"]["to"]})
    assert response.status_code == 200, response.text
    summary = response.json()
    await _setup_accounts(run, {"setup": {"accounts": [f["account_key"] for f in report["figures"]
                                                       if "account_key" in f]}})
    got = {(f["metric"], f.get("account_key"), str(f.get("dimensions"))): await _figure(run, f, report, summary)
           for f in report["figures"]}
    wanted = {(f["metric"], f.get("account_key"), str(f.get("dimensions"))): Decimal(f["value"])
              for f in report["figures"]}
    assert got == wanted
