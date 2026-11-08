"""Per-business, per-area rights (B0.3; threat-model AC-11, AC-47, AC-48; user decision D-39).

Routes are checked exactly: a route needs one right on one area and no right includes
another write right. Create/edit/delete imply view (server, trigger and helper).
"""

import itertools
import re
from pathlib import Path

import pytest
from sqlalchemy import text

from app.core.access_rights import AreaRight
from app.core.dependencies import REGISTERED_ACCESS_PAIRS
from app.services.access_service import AccessService
from sqlalchemy.ext.asyncio import AsyncSession
from tests.support.factories import (
    add_member,
    create_bank_account,
    create_business,
    put_access,
    receipt_body,
)
from tests.support.ledger import create_account
from tests.support.tenancy import business_routes, guard_kind, request_as, route_access_pairs

REPO_ROOT = Path(__file__).resolve().parents[3]
PREFIX = "/api/v1/businesses/{business_id}"
V, C, E, D = "view", "create", "edit", "delete"
COA, MEMBERS, JE = "settings.chart_of_accounts", "settings.members", "journal_entries"

# platform-model Appendix A.3 (FastAPI), plus the B0.3 routes. "member" = membership only.
ROUTE_MAP = {
    "GET /members": [(MEMBERS, V)], "POST /members": [(MEMBERS, C)],
    "PATCH /members/{member_id}": [(MEMBERS, E)], "DELETE /members/{member_id}": [(MEMBERS, D)],
    "GET /members/{member_id}/access": [(MEMBERS, V)],
    "PUT /members/{member_id}/access": [(MEMBERS, E)],
    "POST /users/email-check": [(MEMBERS, C)],
    "GET /me": "member", "GET ": "member", "GET /tabs": "member",
    "DELETE ": [("account.businesses", D)], "DELETE /permanent": [("account.businesses", D)],
    "GET /export": [("account.businesses", D)],
    "POST /restore": [("account.businesses", D)],
    "PUT ": [("settings.business_details", E)], "POST /reset": [("settings.business_details", E)],
    "PUT /tabs": [("settings.customize_tabs", E)],
    "GET /tab-columns/{tab_key}": "tab", "PUT /tab-columns/{tab_key}": [("settings.customize_tabs", E)],
    **{f"GET /chart-of-accounts/{p}": [(COA, V)] for p in
       ("groups", "groups/{group_id}", "accounts", "accounts/{account_id}", "tree")},
    **{f"POST /chart-of-accounts/{p}": [(COA, C)] for p in ("groups", "accounts")},
    **{f"PUT /chart-of-accounts/{p}": [(COA, E)] for p in
       ("groups/order", "groups/{group_id}", "accounts/order", "accounts/{account_id}")},
    **{f"DELETE /chart-of-accounts/{p}": [(COA, D)] for p in ("groups/{group_id}", "accounts/{account_id}")},
    "GET /suspense/balance": [("suspense", V)], "GET /suspense/entries": [("suspense", V)],
    "GET /customers/{contact_id}/receipts": [("customers", V), ("receipts", V)],
    "GET /suppliers/{contact_id}/receipts": [("suppliers", V), ("receipts", V)],
    "GET /history": [("history", V)],
    # B1: journal entries, Transaction Journal, ledger reports, book settings
    "GET /journal-entries": [(JE, V)], "POST /journal-entries": [(JE, C)],
    "POST /journal-entries/totals": [(JE, V)],
    "GET /journal-entries/{document_id}": [(JE, V)], "PUT /journal-entries/{document_id}": [(JE, E)],
    "POST /journal-entries/{document_id}/post": [(JE, E)],
    "POST /journal-entries/{document_id}/void": [(JE, D)],
    "GET /documents/{document_id}/journal": "member",
    "GET /reports/trial-balance": [("reports", V)],
    "GET /reports/general-ledger-transactions": [("reports", V)],
    "GET /settings/books": [("settings.lock_date", V)], "PUT /settings/books": [("settings.lock_date", E)],
    # B2: Summary and starting balances
    "GET /reports/summary": [("summary", V)],
    "GET /starting-balances/accounts": [("settings.starting_balances", V)],
    "PUT /starting-balances/accounts/{account_id}": [("settings.starting_balances", E)],
    # B3: bank and cash, receipts, payments, transfers, capital accounts, parties, attachments
    "GET /starting-balances/bank-accounts": [("settings.starting_balances", V)],
    "PUT /starting-balances/bank-accounts/{bank_account_id}": [("settings.starting_balances", E)],
    "GET /bank-accounts/{bank_account_id}/transactions": [("bank_cash_accounts", V)],
    "GET /parties": "member",
    "GET /attachments": "member", "POST /attachments": "member",
    "GET /attachments/{attachment_id}/url": "member", "DELETE /attachments/{attachment_id}": "member",
}
for _path, _area in (("receipts", "receipts"), ("payments", "payments"),
                     ("inter-account-transfers", "inter_account_transfers")):
    ROUTE_MAP.update({
        f"GET /{_path}": [(_area, V)], f"POST /{_path}": [(_area, C)],
        f"GET /{_path}/{{document_id}}": [(_area, V)], f"PUT /{_path}/{{document_id}}": [(_area, E)],
        f"POST /{_path}/{{document_id}}/post": [(_area, E)], f"POST /{_path}/{{document_id}}/void": [(_area, D)],
    })
# B4: sales trade documents, late fees, customers, tax codes, items, sales settings, invoice starting balances
for _path, _area in (("sales-quotes", "sales_quotes"), ("sales-orders", "sales_orders"),
                     ("sales-invoices", "sales_invoices"), ("credit-notes", "credit_notes"),
                     ("delivery-notes", "delivery_notes"), ("late-payment-fees", "late_payment_fees")):
    ROUTE_MAP.update({
        f"GET /{_path}": [(_area, V)], f"POST /{_path}": [(_area, C)],
        f"GET /{_path}/{{document_id}}": [(_area, V)], f"PUT /{_path}/{{document_id}}": [(_area, E)],
        f"POST /{_path}/{{document_id}}/post": [(_area, E)], f"POST /{_path}/{{document_id}}/void": [(_area, D)],
    })
    if _area != "late_payment_fees":
        ROUTE_MAP.update({f"POST /{_path}/totals": [(_area, V)], f"GET /{_path}/lines": [(_area, V)]})
    if _area in ("sales_quotes", "sales_orders", "sales_invoices"):
        ROUTE_MAP[f"POST /{_path}/{{document_id}}/copy-to"] = [(_area, V)]
ROUTE_MAP.update({
    "GET /sales-invoices/early-payment-discounts": [("sales_invoices", V)],
    "GET /late-payment-fees/proposals": [("late_payment_fees", V)],
    "POST /late-payment-fees/proposals/confirm": [("late_payment_fees", C)],
    "GET /customers/{contact_id}/transactions": [("customers", V)],
    "GET /customers/{contact_id}/open-invoices": [("receipts", V)],
    "GET /settings/sales": [("settings.business_details", V)],
    "PUT /settings/sales": [("settings.business_details", E)],
    "GET /starting-balances/sales-invoices": [("settings.starting_balances", V)],
    "PUT /starting-balances/sales-invoices/{invoice_id}": [("settings.starting_balances", E)],
})
for _path, _area, _id in (("tax-codes", "settings.tax_codes", "tax_code_id"),
                          ("non-inventory-items", "non_inventory_items", "item_id")):
    ROUTE_MAP.update({
        f"GET /{_path}": [(_area, V)], f"POST /{_path}": [(_area, C)],
        f"GET /{_path}/{{{_id}}}": [(_area, V)], f"PUT /{_path}/{{{_id}}}": [(_area, E)],
        f"DELETE /{_path}/{{{_id}}}": [(_area, D)],
    })
for _path in ("receipts", "payments"):
    ROUTE_MAP.update({f"POST /{_path}/totals": [(_path, V)], f"GET /{_path}/lines": [(_path, V)]})
for _path, _area, _id in (("bank-accounts", "bank_cash_accounts", "bank_account_id"),
                          ("customers", "customers", "contact_id"),
                          ("suppliers", "suppliers", "contact_id"),
                          ("capital-accounts", "capital_accounts", "party_id")):
    ROUTE_MAP.update({
        f"GET /{_path}": [(_area, V)], f"POST /{_path}": [(_area, C)],
        f"GET /{_path}/{{{_id}}}": [(_area, V)], f"PUT /{_path}/{{{_id}}}": [(_area, E)],
        f"DELETE /{_path}/{{{_id}}}": [(_area, D)],
    })

ROUTES = business_routes()
PAIR_CASES = [
    (route, pair) for route in ROUTES if guard_kind(route.route) == "pairs"
    for pair in route_access_pairs(route.route)
]


def _short(route_id: str) -> str:
    method, path = route_id.split(" ", 1)
    return f"{method} {path.removeprefix('/api/v1' + PREFIX.removeprefix('/api/v1'))}"


async def _grantable(db_conn) -> dict[str, bool]:
    rows = await db_conn.execute(text(
        "SELECT a.key, a.is_view_only FROM areas a JOIN modules m ON m.id = a.module_id"
        " WHERE NOT a.is_owner_only AND m.key <> 'platform'"
    ))
    return dict(rows.all())


async def _setup(client, users, areas=None, mode="custom"):
    owner = await users.create()
    business = await create_business(client, owner)
    member = await users.create_member(owner, business["id"])
    row = await add_member(client, owner, business["id"], member, mode, areas)
    return owner, business["id"], member, row


async def _has(db_conn, business_id, user_id, area, right) -> bool:
    result = await db_conn.execute(
        text("SELECT public.member_has_area_access(CAST(:b AS uuid), CAST(:u AS uuid), :a, :r)"),
        {"b": business_id, "u": user_id, "a": area, "r": right},
    )
    return bool(result.scalar())


# ------------------------------------------------------------------ route inventory


def test_route_inventory_matches_route_map():
    actual = {
        _short(r.id): (route_access_pairs(r.route) if guard_kind(r.route) == "pairs" else guard_kind(r.route))
        for r in ROUTES
    }
    assert actual == ROUTE_MAP


async def test_route_access_pairs_valid_against_seed(db_conn):
    async with AsyncSession(bind=db_conn) as session:
        assert await AccessService(session).invalid_route_pairs(REGISTERED_ACCESS_PAIRS) == []
        assert await AccessService(session).invalid_route_pairs({("summary", "create")}) == [
            ("summary", "create")
        ]


def test_require_business_access_refuses_bare_string_right():
    from app.core.dependencies import require_business_access

    with pytest.raises(TypeError):
        require_business_access("receipts", "view")


# ------------------------------------------------------------------ AC-11


@pytest.mark.parametrize(
    "business_route,pair", PAIR_CASES,
    ids=[f"{a}-{r}-{_short(route.id)}" for route, (a, r) in PAIR_CASES],
)
async def test_denied_without_right(client, users, db_conn, business_route, pair):
    """The member holds every other right (on every area) but not the one the route needs."""
    area, right = pair
    grantable = await _grantable(db_conn)
    grid = []
    for key, view_only in grantable.items():
        rights = [V] if view_only else [V, C, E, D]
        if key == area:
            rights = [] if right == V else [x for x in rights if x != right]
        grid.append({"area_key": key, "rights": rights})
    _, business_id, member, _ = await _setup(client, users, grid)

    response = await request_as(client, member, business_route, business_id)

    assert response.status_code == 403, response.text
    assert "permission" in response.json()["error"].lower()


# ------------------------------------------------------------------ D-39 independence on receipts

WRITE_RIGHTS = (C, E, D)
COMBOS = [tuple(c) for n in range(4) for c in itertools.combinations(WRITE_RIGHTS, n)]


async def _receipt_fixture(client, owner, business_id):
    account = await create_bank_account(client, owner, business_id)
    income = await create_account(client, owner, business_id, "Service income", "income")
    body = receipt_body(account["id"], [(income, "10")], post=False)
    created = await client.post(f"/api/v1/businesses/{business_id}/receipts", json=body, headers=owner.headers)
    assert created.status_code == 201, created.text
    return body, created.json()["id"]


async def _receipt_calls(client, owner, member, business_id, body, receipt_id) -> dict[str, int]:
    base = f"/api/v1/businesses/{business_id}/receipts"

    async def version() -> int:
        return (await client.get(f"{base}/{receipt_id}", headers=owner.headers)).json()["version"]

    codes = {
        V: (await client.get(base, headers=member.headers)).status_code,
        C: (await client.post(base, json=body, headers=member.headers)).status_code,
    }
    edit = {**{k: v for k, v in body.items() if k != "post"}, "reference": "X", "version": await version()}
    codes[E] = (await client.put(f"{base}/{receipt_id}", json=edit, headers=member.headers)).status_code
    codes[D] = (await client.post(
        f"{base}/{receipt_id}/void", json={"version": await version()}, headers=member.headers
    )).status_code
    return codes


async def _receipts_member(client, users, rights):
    owner = await users.create()
    business_id = (await create_business(client, owner))["id"]
    body, receipt_id = await _receipt_fixture(client, owner, business_id)
    member = await users.create_member(owner, business_id)
    await add_member(client, owner, business_id, member, "custom",
                     [{"area_key": "receipts", "rights": [V, *rights]},
                      {"area_key": "bank_cash_accounts", "rights": [V]}])
    return await _receipt_calls(client, owner, member, business_id, body, receipt_id)


SUCCESS = {V: 200, C: 201, E: 200, D: 200}


@pytest.mark.parametrize("combo", COMBOS, ids=["view+" + "+".join(c) if c else "view" for c in COMBOS])
async def test_independent_rights_combinations(client, users, combo):
    codes = await _receipts_member(client, users, combo)

    expected = {right: SUCCESS[right] if right in (V, *combo) else 403 for right in SUCCESS}
    assert codes == expected


async def test_delete_without_edit_can_void_but_not_update(client, users):
    codes = await _receipts_member(client, users, (D,))
    assert (codes[E], codes[D]) == (403, 200)


async def test_create_without_edit_cannot_update(client, users):
    codes = await _receipts_member(client, users, (C,))
    assert (codes[C], codes[E]) == (201, 403)


async def test_edit_without_create_cannot_create(client, users):
    codes = await _receipts_member(client, users, (E,))
    assert (codes[E], codes[C]) == (200, 403)


# ------------------------------------------------------------------ implied view


@pytest.mark.parametrize("right", WRITE_RIGHTS)
async def test_granting_create_edit_or_delete_grants_view(client, users, db_conn, right):
    owner, business_id, member, row = await _setup(client, users)

    response = await put_access(client, owner, business_id, row,
                                areas=[{"area_key": "receipts", "rights": [right]}])
    await db_conn.execute(text(
        "INSERT INTO business_member_area_access VALUES (CAST(:b AS uuid), CAST(:m AS uuid), 'customers', :r)"
    ), {"b": business_id, "m": row["id"], "r": right})
    direct = await db_conn.execute(text(
        "SELECT right_key FROM business_member_area_access WHERE business_member_id = CAST(:m AS uuid)"
        " AND area_key = 'customers' ORDER BY right_key"
    ), {"m": row["id"]})

    assert response.json()["areas"] == [{"area_key": "receipts", "rights": [V, right]}]
    assert sorted(direct.scalars().all()) == sorted([V, right])


async def test_revoking_view_revokes_all_rights_on_area(client, users, db_conn):
    grid = [{"area_key": "receipts", "rights": [V, C, E]}, {"area_key": "customers", "rights": [C, D]}]
    owner, business_id, member, row = await _setup(client, users, grid)

    response = await put_access(client, owner, business_id, row, areas=[
        {"area_key": "receipts", "rights": []}, {"area_key": "customers", "rights": [C, D]}])
    await db_conn.execute(text(
        "DELETE FROM business_member_area_access WHERE business_member_id = CAST(:m AS uuid)"
        " AND area_key = 'customers' AND right_key = 'view'"
    ), {"m": row["id"]})
    left = await db_conn.execute(text(
        "SELECT count(*) FROM business_member_area_access WHERE business_member_id = CAST(:m AS uuid)"
    ), {"m": row["id"]})

    assert response.json()["areas"] == [{"area_key": "customers", "rights": [V, C, D]}]
    assert left.scalar() == 0


async def test_non_view_right_without_view_row_is_not_effective(client, users, db_conn):
    grid = [{"area_key": "customers", "rights": [V, C]}]
    owner, business_id, member, row = await _setup(client, users, grid)
    await db_conn.execute(text("ALTER TABLE business_member_area_access DISABLE TRIGGER bmaa_view_revoked"))
    await db_conn.execute(text(
        "DELETE FROM business_member_area_access WHERE business_member_id = CAST(:m AS uuid)"
        " AND right_key = 'view'"
    ), {"m": row["id"]})

    created = await client.post(f"/api/v1/businesses/{business_id}/customers",
                                json={"name": "X"}, headers=member.headers)

    assert not await _has(db_conn, business_id, member.id, "customers", C)
    assert created.status_code == 403


# ------------------------------------------------------------------ AC-48 crafted values


@pytest.mark.parametrize("value", ["full", "none", "admin", "*", "VIEW", "view ", None, 1])
async def test_unknown_right_rejected_422(client, users, value):
    owner, business_id, _, row = await _setup(client, users)

    response = await put_access(client, owner, business_id, row,
                                areas=[{"area_key": "receipts", "rights": [value]}])

    assert response.status_code == 422


async def test_non_view_right_on_view_only_area_rejected_422(client, users):
    owner, business_id, _, row = await _setup(client, users)

    response = await put_access(client, owner, business_id, row,
                                areas=[{"area_key": "summary", "rights": [C]}])

    assert response.status_code == 422


@pytest.mark.parametrize("area", ["settings.members", "account.businesses", "platform.users", "nope"])
async def test_right_on_owner_only_or_platform_area_rejected_422(client, users, area):
    owner, business_id, _, row = await _setup(client, users)

    response = await put_access(client, owner, business_id, row, areas=[{"area_key": area, "rights": [V]}])

    assert response.status_code == 422


async def test_access_grid_put_is_atomic(client, users):
    owner, business_id, _, row = await _setup(client, users, [{"area_key": "receipts", "rights": [V]}])

    response = await put_access(client, owner, business_id, row, areas=[
        {"area_key": "customers", "rights": [V, C]}, {"area_key": "summary", "rights": [E]}])
    after = await client.get(f"/api/v1/businesses/{business_id}/members/{row['id']}/access",
                             headers=owner.headers)

    assert response.status_code == 422
    assert after.json()["areas"] == [{"area_key": "receipts", "rights": [V]}]


async def test_access_grid_duplicates_normalized(client, users):
    owner, business_id, _, row = await _setup(client, users)

    response = await put_access(client, owner, business_id, row, areas=[
        {"area_key": "receipts", "rights": [D, D, C]}, {"area_key": "receipts", "rights": [V]}])

    assert response.json()["areas"] == [{"area_key": "receipts", "rights": [V, C, D]}]


async def test_access_grid_stale_version_409(client, users):
    owner, business_id, _, row = await _setup(client, users)
    url = f"/api/v1/businesses/{business_id}/members/{row['id']}/access"

    first = await client.put(url, json={"access_mode": "full", "version": row["version"]}, headers=owner.headers)
    stale = await client.put(url, json={"access_mode": "custom", "version": row["version"]}, headers=owner.headers)

    assert (first.status_code, stale.status_code) == (200, 409)


# ------------------------------------------------------------------ helper and constants


async def test_has_area_access_unknown_right_false_for_owner_and_full(client, users, db_conn):
    owner, business_id, member, _ = await _setup(client, users, mode="full")

    for user_id in (owner.id, member.id):
        for right in ("full", "admin", "*", "VIEW", ""):
            assert not await _has(db_conn, business_id, user_id, "receipts", right)
        assert not await _has(db_conn, business_id, user_id, "summary", C)
        assert not await _has(db_conn, business_id, user_id, "platform.users", V)
        assert not await _has(db_conn, business_id, user_id, "no_such_area", V)


async def test_access_right_constants_match_db_seed(db_conn):
    seed = (await db_conn.execute(text(
        "SELECT key, implies_view FROM area_rights ORDER BY sort_order"))).all()
    frontend = (REPO_ROOT / "frontend/src/lib/constants/access-rights.js").read_text(encoding="utf-8")
    fe_values = dict(re.findall(r"export const (RIGHT_\w+) = '(\w+)'", frontend))
    fe_rights = [fe_values[name] for name in re.search(
        r"AREA_RIGHTS = \[([^\]]+)\]", frontend).group(1).replace(" ", "").split(",")]

    assert [k for k, _ in seed] == [r.value for r in AreaRight] == fe_rights
    assert {k for k, implies in seed if implies} == {r.value for r in AreaRight if r != AreaRight.VIEW}


async def test_presets_only_tick_boxes_and_keep_no_link(client, users, db_conn):
    user = await users.create()

    presets = await client.get("/api/v1/access-presets", headers=user.headers)
    links = await db_conn.execute(text(
        "SELECT count(*) FROM information_schema.columns WHERE table_name IN"
        " ('business_members', 'business_member_area_access') AND column_name LIKE '%preset%'"
    ))

    by_key = {p["key"]: {a["area_key"]: a["rights"] for a in p["areas"]} for p in presets.json()["items"]}
    assert list(by_key) == ["view_only", "bookkeeper", "accountant"]
    assert by_key["bookkeeper"]["receipts"] == [V, C, E]
    assert by_key["accountant"]["receipts"] == [V, C, E, D]
    assert "history" not in by_key["bookkeeper"] and by_key["accountant"]["history"] == [V]
    assert all(r == [V] for r in by_key["view_only"].values())
    assert links.scalar() == 0


async def test_access_areas_list_only_grantable_areas(client, users):
    user = await users.create()

    response = await client.get("/api/v1/access-areas", headers=user.headers)

    assert response.status_code == 200
    by_key = {a["key"]: a for a in response.json()["items"]}
    assert MEMBERS not in by_key and "account.businesses" not in by_key
    assert not any(key.startswith("platform.") for key in by_key)
    assert by_key["summary"]["is_view_only"] and not by_key["receipts"]["is_view_only"]
    assert by_key["customers"]["tab_key"] == "customers"


# ------------------------------------------------------------------ M8: new areas, owner, full


async def _insert_area(db_conn, key="new_feature"):
    await db_conn.execute(text(
        "INSERT INTO areas (key, label, module_id) SELECT :k, 'New', id FROM modules WHERE key = 'banking'"
    ), {"k": key})


async def test_full_access_member_gets_every_right_on_new_area_without_rows(client, users, db_conn):
    _, business_id, member, _ = await _setup(client, users, mode="full")
    await _insert_area(db_conn)

    assert all([await _has(db_conn, business_id, member.id, "new_feature", r) for r in (V, C, E, D)])


async def test_custom_member_new_area_has_no_rights(client, users, db_conn):
    grid = [{"area_key": "receipts", "rights": [V, C, E, D]}]
    _, business_id, member, _ = await _setup(client, users, grid)
    await _insert_area(db_conn)

    assert not any([await _has(db_conn, business_id, member.id, "new_feature", r) for r in (V, C, E, D)])


async def test_owner_every_right_on_every_area(client, users, db_conn):
    owner, business_id, _, _ = await _setup(client, users)
    await _insert_area(db_conn)
    areas = (await db_conn.execute(text(
        "SELECT a.key, a.is_view_only FROM areas a JOIN modules m ON m.id = a.module_id"
        " WHERE m.key <> 'platform'"))).all()

    for key, view_only in areas:
        for right in [V] if view_only else [V, C, E, D]:
            assert await _has(db_conn, business_id, owner.id, key, right), (key, right)


async def test_full_access_member_has_all_four_rights_but_no_member_management(client, users, db_conn):
    _, business_id, member, _ = await _setup(client, users, mode="full")

    me = await client.get(f"/api/v1/businesses/{business_id}/me", headers=member.headers)
    members = await client.get(f"/api/v1/businesses/{business_id}/members", headers=member.headers)

    rights = {a["area_key"]: a["rights"] for a in me.json()["areas"]}
    grantable = await _grantable(db_conn)
    assert rights == {k: [V] if view_only else [V, C, E, D] for k, view_only in grantable.items()}
    assert "settings.members" not in rights and "account.businesses" not in rights
    assert members.status_code == 403
