"""B2: chart structure, system accounts, country templates, starting balances, Summary."""

from sqlalchemy import text

from tests.support.factories import create_business
from tests.support.ledger import biz, create_account, journal, post_je, set_lock_date

START = "2026-01-01"
OPENING = "2025-12-31"


def _nodes(nodes):
    for node in nodes:
        yield node
        yield from _nodes(node["groups"])


async def _tree(client, owner, bid, as_at="2100-12-31") -> dict:
    response = await client.get(biz(bid, f"/chart-of-accounts/tree?as_at={as_at}"), headers=owner.headers)
    assert response.status_code == 200, response.text
    return response.json()


async def _root(client, owner, bid, key) -> dict:
    return next(r for r in (await _tree(client, owner, bid))["roots"] if r["root_key"] == key)


async def _system_account(client, owner, bid, code) -> dict:
    tree = await _tree(client, owner, bid)
    return next(a for n in _nodes(tree["roots"]) for a in n["accounts"] if a["system_account_code"] == code)


async def _business(client, users, start=START):
    owner = await users.create()
    bid = (await create_business(client, owner))["id"]
    await set_lock_date(client, owner, bid, None, books_start_date=start)
    return owner, bid


async def _set_opening(client, owner, bid, account_id, side, amount):
    return await client.put(biz(bid, f"/starting-balances/accounts/{account_id}"),
                            json={"side": side, "amount": amount}, headers=owner.headers)


async def _summary(client, owner, bid, date_from=START, date_to="2026-12-31") -> dict:
    response = await client.get(biz(bid, f"/reports/summary?from={date_from}&to={date_to}"), headers=owner.headers)
    assert response.status_code == 200, response.text
    return response.json()


# ---------------------------------------------------------------------------- structure

async def test_new_business_has_all_system_accounts_in_real_groups(client, users, db_conn):
    owner, bid = await _business(client, users)
    types = (await db_conn.execute(text("SELECT count(*) FROM system_account_types"))).scalar_one()
    rows = (await db_conn.execute(text("""
        SELECT s.code, s.root_key, public.coa_group_root(a.business_id, a.group_id) AS root
        FROM coa_accounts a JOIN system_account_types s ON s.id = a.system_account_type_id
        WHERE a.business_id = :b"""), {"b": bid})).all()
    roots = [r["root_key"] for r in (await _tree(client, owner, bid))["roots"]]

    assert roots == ["assets", "liabilities", "equity", "income", "expenses"]
    assert len(rows) == types and all(r.root == r.root_key for r in rows)


async def test_hidden_system_account_shown_once_its_tab_is_enabled(client, users):
    owner, bid = await _business(client, users)
    codes = {a["system_account_code"] for n in _nodes((await _tree(client, owner, bid))["roots"])
             for a in n["accounts"]}

    assert "retained_earnings" in codes
    # Banking tabs are on by default since B3 and sales tabs since B4, so Cash & cash equivalents and
    # Accounts receivable show; Capital accounts does not.
    assert {"cash_control", "accounts_receivable"} <= codes
    assert not codes & {"suspense", "capital_control"}


async def test_group_cycle_rejected(client, users):
    owner, bid = await _business(client, users)
    assets = await _root(client, owner, bid, "assets")
    outer = (await client.post(biz(bid, "/chart-of-accounts/groups"), headers=owner.headers,
                               json={"name": "Outer", "type": "balance_sheet", "parent_group_id": assets["id"]})).json()
    inner = (await client.post(biz(bid, "/chart-of-accounts/groups"), headers=owner.headers,
                               json={"name": "Inner", "type": "balance_sheet", "parent_group_id": outer["id"]})).json()

    moved = await client.put(biz(bid, f"/chart-of-accounts/groups/{outer['id']}"), headers=owner.headers,
                             json={"version": outer["version"], "parent_group_id": inner["id"]})

    assert moved.status_code == 422 and moved.json()["details"]["code"] == "group_cycle"


async def test_account_type_must_match_group_panel(client, users):
    owner, bid = await _business(client, users)
    expenses = await _root(client, owner, bid, "expenses")

    wrong = await client.post(biz(bid, "/chart-of-accounts/accounts"), headers=owner.headers,
                              json={"name": "Cash box", "type": "asset", "group_id": expenses["id"]})
    pl_group = await client.post(biz(bid, "/chart-of-accounts/groups"), headers=owner.headers,
                                 json={"name": "BS under P&L", "type": "balance_sheet",
                                       "parent_group_id": expenses["id"]})

    assert wrong.status_code == 422 and wrong.json()["details"]["code"] == "account_type_mismatch"
    assert pl_group.status_code == 422 and pl_group.json()["details"]["code"] == "group_panel_mismatch"


async def test_db_rejects_account_type_outside_its_root(client, users, db_conn):
    owner, bid = await _business(client, users)
    expenses = await _root(client, owner, bid, "expenses")
    sp = await db_conn.begin_nested()
    try:
        await db_conn.execute(text("INSERT INTO coa_accounts (business_id, name, type, group_id)"
                                   " VALUES (:b, 'X', 'asset', :g)"), {"b": bid, "g": expenses["id"]})
        raised = False
    except Exception:  # noqa: BLE001 - the trigger's check_violation
        raised = True
    await sp.rollback()
    assert raised


async def test_system_account_renameable_not_deletable(client, users):
    owner, bid = await _business(client, users)
    retained = await _system_account(client, owner, bid, "retained_earnings")
    url = biz(bid, f"/chart-of-accounts/accounts/{retained['id']}")

    renamed = await client.put(url, json={"version": retained["version"], "name": "Accumulated profit"},
                               headers=owner.headers)
    deleted = await client.delete(url, params={"version": renamed.json()["version"]}, headers=owner.headers)

    assert renamed.status_code == 200 and renamed.json()["name"] == "Accumulated profit"
    assert deleted.status_code == 403


async def test_delete_account_with_postings_409(client, users):
    owner, bid = await _business(client, users)
    used = await create_account(client, owner, bid, "Used", "expense")
    other = await create_account(client, owner, bid, "Other", "expense")
    await post_je(client, owner, bid, "2026-03-01", [(used, "5", "0"), (other, "0", "5")])
    current = (await client.get(biz(bid, f"/chart-of-accounts/accounts/{used}"), headers=owner.headers)).json()

    response = await client.delete(biz(bid, f"/chart-of-accounts/accounts/{used}"),
                                   params={"version": current["version"]}, headers=owner.headers)

    assert response.status_code == 409 and response.json()["details"]["code"] == "account_in_use"


async def test_delete_group_moves_accounts_to_chosen_parent(client, users):
    owner, bid = await _business(client, users)
    expenses = await _root(client, owner, bid, "expenses")
    post = lambda name, parent: client.post(  # noqa: E731
        biz(bid, "/chart-of-accounts/groups"), headers=owner.headers,
        json={"name": name, "type": "pl", "parent_group_id": parent})
    keep = (await post("Keep", expenses["id"])).json()
    doomed = (await post("Doomed", expenses["id"])).json()
    child = (await post("Child", doomed["id"])).json()
    account = await create_account(client, owner, bid, "Moved", "expense", group_id=doomed["id"])

    response = await client.delete(biz(bid, f"/chart-of-accounts/groups/{doomed['id']}"),
                                   params={"version": doomed["version"], "move_to": keep["id"]},
                                   headers=owner.headers)
    moved = (await client.get(biz(bid, f"/chart-of-accounts/accounts/{account}"), headers=owner.headers)).json()
    child_now = (await client.get(biz(bid, f"/chart-of-accounts/groups/{child['id']}"), headers=owner.headers)).json()

    assert response.status_code == 204, response.text
    assert moved["group_id"] == keep["id"] and child_now["parent_group_id"] == keep["id"]


# ---------------------------------------------------------------------------- templates

async def test_create_business_preselects_user_country_and_applies_template(client, users, db_conn):
    owner = await users.create()
    await db_conn.execute(text("UPDATE user_profiles SET country_id = (SELECT id FROM countries WHERE code = 'PK')"
                               " WHERE user_id = :u"), {"u": owner.id})
    business = (await client.post("/api/v1/businesses", json={"name": "Lahore Traders"},
                                  headers=owner.headers)).json()
    generic = (await client.post("/api/v1/businesses", json={"name": "Plain", "country_id": None},
                                 headers=owner.headers)).json()
    base = text("SELECT c.code FROM business_currencies bc JOIN currencies c ON c.id = bc.currency_id"
                " WHERE bc.business_id = :b AND bc.is_base")
    names = lambda tree: {a["name"] for n in _nodes(tree["roots"]) for a in n["accounts"]}  # noqa: E731

    assert business["country"] == "Pakistan" and generic["country_id"] is None
    assert (await db_conn.execute(base, {"b": business["id"]})).scalar_one() == "PKR"
    assert (await db_conn.execute(base, {"b": generic["id"]})).scalar_one() == "USD"
    assert "Salaries and wages" in names(await _tree(client, owner, business["id"]))
    assert "Accounting fees" in names(await _tree(client, owner, generic["id"]))


async def test_business_read_carries_its_date_and_number_format(client, users, db_conn):
    owner = await users.create()
    await db_conn.execute(text("UPDATE user_profiles SET country_id = (SELECT id FROM countries WHERE code = 'PK')"
                               " WHERE user_id = :u"), {"u": owner.id})
    created = (await client.post("/api/v1/businesses", json={"name": "Karachi Books"}, headers=owner.headers)).json()

    read = (await client.get(f"/api/v1/businesses/{created['id']}", headers=owner.headers)).json()
    await db_conn.execute(text("DELETE FROM business_format WHERE business_id = :b"), {"b": created["id"]})
    unset = (await client.get(f"/api/v1/businesses/{created['id']}", headers=owner.headers)).json()

    assert read["format"] == {
        "date_format": "dd/MM/yyyy", "number_format": "1,234.56", "currency_code": "PKR", "decimal_places": 2,
    }
    assert unset["format"] == read["format"]  # no saved format: the country's template


async def test_reapply_template_adds_only_missing(client, users, db_conn):
    owner, bid = await _business(client, users)
    count = text("SELECT count(*) FROM coa_accounts WHERE business_id = :b")
    before = (await db_conn.execute(count, {"b": bid})).scalar_one()
    await db_conn.execute(text("DELETE FROM coa_accounts WHERE business_id = :b AND code = '6080'"), {"b": bid})

    added = (await db_conn.execute(text("SELECT apply_country_template(:b)"), {"b": bid})).scalar_one()
    again = (await db_conn.execute(text("SELECT apply_country_template(:b)"), {"b": bid})).scalar_one()

    assert (added, again) == (1, 0)
    assert (await db_conn.execute(count, {"b": bid})).scalar_one() == before


async def test_seed_business_chart_is_idempotent(client, users, db_conn):
    _, bid = await _business(client, users)
    count = text("SELECT (SELECT count(*) FROM coa_accounts WHERE business_id = :b)"
                 " + (SELECT count(*) FROM coa_groups WHERE business_id = :b)")
    before = (await db_conn.execute(count, {"b": bid})).scalar_one()
    await db_conn.execute(text("SELECT seed_business_chart(:b)"), {"b": bid})
    assert (await db_conn.execute(count, {"b": bid})).scalar_one() == before


async def test_template_preview_falls_back_to_generic(client, users):
    owner = await users.create()
    response = await client.get("/api/v1/country-templates/preview", headers=owner.headers)
    assert response.status_code == 200 and response.json()["template_key"] == "generic"


# ---------------------------------------------------------------------------- starting balances

async def test_opening_entry_dated_day_before_books_start(client, users):
    owner, bid = await _business(client, users)
    prepaid = await create_account(client, owner, bid, "Prepaid insurance", "asset")

    item = (await _set_opening(client, owner, bid, prepaid, "debit", "400")).json()
    entries = (await journal(client, owner, bid, item["document_id"]))["entries"]

    assert [(e["entry_date"], e["source"]) for e in entries] == [(OPENING, "opening")]
    assert {(x["account_id"] == prepaid, x["debit"], x["credit"]) for x in entries[0]["lines"]} == {
        (True, "400.00", "0.00"), (False, "0.00", "400.00")}


async def test_one_opening_entry_per_source_record(client, users, db_conn):
    owner, bid = await _business(client, users)
    prepaid = await create_account(client, owner, bid, "Prepaid", "asset")
    deposit = await create_account(client, owner, bid, "Deposit", "asset")
    await _set_opening(client, owner, bid, prepaid, "debit", "10")
    other = (await _set_opening(client, owner, bid, deposit, "debit", "5")).json()
    sp = await db_conn.begin_nested()
    try:
        await db_conn.execute(text("INSERT INTO opening_balances (document_id, business_id, kind_key, account_id)"
                                   " SELECT id, business_id, 'account', :a FROM documents WHERE id = :d"),
                              {"a": prepaid, "d": other["document_id"]})
        raised = False
    except Exception:  # noqa: BLE001 - unique_violation from the trigger
        raised = True
    await sp.rollback()
    listed = (await client.get(biz(bid, "/starting-balances/accounts"), headers=owner.headers)).json()

    assert raised
    assert [i["amount"] for i in listed["items"] if i["account_id"] == prepaid] == ["10.00"]


async def test_change_opening_balance_voids_and_reposts_that_record_only(client, users):
    owner, bid = await _business(client, users)
    first = await create_account(client, owner, bid, "First", "asset")
    second = await create_account(client, owner, bid, "Loan", "liability")
    a = (await _set_opening(client, owner, bid, first, "debit", "100")).json()
    b = (await _set_opening(client, owner, bid, second, "credit", "30")).json()

    changed = (await _set_opening(client, owner, bid, first, "debit", "150")).json()
    old = (await journal(client, owner, bid, a["document_id"]))["entries"]
    untouched = (await journal(client, owner, bid, b["document_id"]))["entries"]
    listed = (await client.get(biz(bid, "/starting-balances/accounts"), headers=owner.headers)).json()

    assert changed["document_id"] != a["document_id"] and changed["amount"] == "150.00"
    assert [e["source"] for e in old] == ["opening", "reversal"]
    assert [e["source"] for e in untouched] == ["opening"]
    assert listed["retained_earnings_effect"] == {"side": "credit", "amount": "120.00"}


async def test_opening_balance_refused_for_pl_and_control_accounts(client, users):
    owner, bid = await _business(client, users)
    rent = await create_account(client, owner, bid, "Rent", "expense")
    cash = await _system_account(client, owner, bid, "retained_earnings")
    for account in (rent, cash["id"]):
        response = await _set_opening(client, owner, bid, account, "debit", "1")
        assert response.status_code == 422 and response.json()["details"]["code"] == "opening_balance_not_allowed"


async def test_document_before_books_start_rejected(client, users):
    owner, bid = await _business(client, users)
    rent = await create_account(client, owner, bid, "Rent", "expense")
    funds = await create_account(client, owner, bid, "Funds", "equity")

    response = await post_je(client, owner, bid, "2025-12-31", [(rent, "1", "0"), (funds, "0", "1")])

    assert response.status_code == 422 and response.json()["details"]["code"] == "before_books_start"


async def test_moving_books_start_date_reposts_every_opening_entry(client, users):
    owner, bid = await _business(client, users)
    prepaid = await create_account(client, owner, bid, "Prepaid", "asset")
    first = (await _set_opening(client, owner, bid, prepaid, "debit", "400")).json()

    await set_lock_date(client, owner, bid, None, books_start_date="2026-02-01")
    listed = (await client.get(biz(bid, "/starting-balances/accounts"), headers=owner.headers)).json()
    item = next(i for i in listed["items"] if i["account_id"] == prepaid)
    entries = (await journal(client, owner, bid, item["document_id"]))["entries"]

    assert item["document_id"] != first["document_id"] and item["amount"] == "400.00"
    assert [e["entry_date"] for e in entries] == ["2026-01-31"]


async def test_moving_books_start_after_documents_refused(client, users):
    owner, bid = await _business(client, users)
    rent = await create_account(client, owner, bid, "Rent", "expense")
    funds = await create_account(client, owner, bid, "Funds", "equity")
    await post_je(client, owner, bid, "2026-01-10", [(rent, "1", "0"), (funds, "0", "1")])
    current = (await client.get(biz(bid, "/settings/books"), headers=owner.headers)).json()

    response = await client.put(biz(bid, "/settings/books"), headers=owner.headers, json={
        "version": current["version"], "books_start_date": "2026-02-01", "lock_date": None})

    assert response.status_code == 422 and response.json()["details"]["code"] == "documents_before_books_start"


# ---------------------------------------------------------------------------- Summary

async def test_pl_total_equals_sum_of_all_pl_accounts(client, users, db_conn):
    owner, bid = await _business(client, users)
    sales = await create_account(client, owner, bid, "Services", "income")
    rent = await create_account(client, owner, bid, "Office rent", "expense")
    funds = await create_account(client, owner, bid, "Owner funds", "equity")
    await post_je(client, owner, bid, "2026-02-01", [(funds, "500", "0"), (sales, "0", "500")])
    await post_je(client, owner, bid, "2026-02-02", [(rent, "120", "0"), (funds, "0", "120")])

    summary = await _summary(client, owner, bid)
    ledger = (await db_conn.execute(text("""
        SELECT sum(l.credit - l.debit) FROM journal_lines l JOIN coa_accounts a
          ON a.business_id = l.business_id AND a.id = l.account_id
        WHERE l.business_id = :b AND a.type IN ('income', 'expense')"""), {"b": bid})).scalar_one()

    assert summary["profit_and_loss"]["net_profit"] == "380.00" == f"{ledger:.2f}"
    assert summary["retained_earnings"]["cumulative_profit"] == "380.00"


async def test_summary_balances_with_opening_balance(client, users):
    owner, bid = await _business(client, users)
    prepaid = await create_account(client, owner, bid, "Prepaid insurance", "asset")
    await _set_opening(client, owner, bid, prepaid, "debit", "400")

    bs = (await _summary(client, owner, bid))["balance_sheet"]

    assert (bs["total_assets"], bs["total_liabilities_and_equity"], bs["is_balanced"]) == ("400.00", "400.00", True)
