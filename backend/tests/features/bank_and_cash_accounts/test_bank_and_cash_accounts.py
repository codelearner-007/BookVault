"""B3 bank and cash accounts: ledger balances, pending columns (PR-12), delete rules (AC-23), transfers."""

from tests.support.factories import create_bank_account, create_business, receipt_body
from tests.support.ledger import bank_account, biz, create_account, journal, system_account_id

DAY = "2026-11-08"


async def _books(client, users):
    owner = await users.create("admin")
    bid = (await create_business(client, owner))["id"]
    return owner, bid


async def test_bank_accounts_crud_and_soft_delete(client, users):
    owner, bid = await _books(client, users)
    base = biz(bid, "/bank-accounts")
    account = await create_bank_account(client, owner, bid, code="B1")
    renamed = await client.put(f"{base}/{account['id']}", json={"name": "Renamed", "version": account["version"]},
                               headers=owner.headers)
    removed = await client.delete(f"{base}/{account['id']}", params={"version": renamed.json()["version"]},
                                  headers=owner.headers)
    listed = await client.get(base, headers=owner.headers)
    assert renamed.json()["name"] == "Renamed" and renamed.json()["code"] == "B1"
    assert removed.status_code == 204 and listed.json()["total"] == 0


async def test_delete_referenced_bank_account_409(client, users):
    owner, bid = await _books(client, users)
    account = await create_bank_account(client, owner, bid, "50.00")
    response = await client.delete(biz(bid, f"/bank-accounts/{account['id']}"),
                                   params={"version": account["version"]}, headers=owner.headers)
    assert response.status_code == 409 and response.json()["details"]["code"] == "bank_account_in_use"


async def test_starting_balance_is_its_own_two_line_opening_entry(client, users):
    """T67 shape: Dr Cash & cash equivalents[bank] / Cr Retained earnings, dated books start - 1."""
    owner, bid = await _books(client, users)
    account = await create_bank_account(client, owner, bid, "50.00")
    listed = (await client.get(biz(bid, "/starting-balances/bank-accounts"), headers=owner.headers)).json()
    item = listed["items"][0]
    entries = (await journal(client, owner, bid, item["document_id"]))["entries"]
    assert account["actual_balance"] == "50.00" and item["amount"] == "50.00" and item["side"] == "debit"
    assert [e["source"] for e in entries] == ["opening"] and entries[0]["entry_date"] == listed["opening_date"]
    assert listed["retained_earnings_effect"] == {"side": "credit", "amount": "50.00"}


async def test_pending_deposits_and_withdrawals(client, users):
    """T83-T85: pending = cleared later without a clear date; a future clear date counts as cleared."""
    owner, bid = await _books(client, users)
    cash = await create_bank_account(client, owner, bid, "750", name="Cash", can_have_pending=True)
    income = await create_account(client, owner, bid, "Service income", "income")
    charges = await create_account(client, owner, bid, "Bank charges")
    for kind, account, amount, cleared_on in (("receipts", income, "40", None),
                                               ("payments", charges, "15", "2026-12-31"),
                                               ("payments", charges, "10", None)):
        body = receipt_body(cash["id"], [(account, amount)], clears_later=True, cleared_on=cleared_on)
        assert (await client.post(biz(bid, f"/{kind}"), json=body, headers=owner.headers)).status_code == 201
    balances = await bank_account(client, owner, bid, cash["id"])
    assert (balances["cleared_balance"], balances["pending_deposits"], balances["pending_withdrawals"],
            balances["actual_balance"]) == ("735.00", "40.00", "-10.00", "765.00")


async def test_pending_flag_cannot_be_turned_off_while_used(client, users):
    owner, bid = await _books(client, users)
    cash = await create_bank_account(client, owner, bid, name="Cash", can_have_pending=True)
    income = await create_account(client, owner, bid, "Service income", "income")
    await client.post(biz(bid, "/receipts"), headers=owner.headers,
                      json=receipt_body(cash["id"], [(income, "5")], clears_later=True))
    response = await client.put(biz(bid, f"/bank-accounts/{cash['id']}"), headers=owner.headers,
                                json={"version": cash["version"], "can_have_pending": False})
    assert response.status_code == 409 and response.json()["details"]["code"] == "pending_transactions_exist"


async def test_transfer_posts_two_cash_lines_and_no_transfer_account(client, users):
    """T03 / T64 shape (BV-04): Dr Cash[to] / Cr Cash[from]; per-side clear dates never touch the GL."""
    owner, bid = await _books(client, users)
    bank = await create_bank_account(client, owner, bid, "500", name="Bank")
    cash = await create_bank_account(client, owner, bid, name="Cash", can_have_pending=True)
    response = await client.post(biz(bid, "/inter-account-transfers"), headers=owner.headers, json={
        "date": DAY, "from_bank_account_id": bank["id"], "to_bank_account_id": cash["id"], "amount": "200",
        "to_clears_later": True, "to_cleared_on": "2027-01-10", "post": True})
    assert response.status_code == 201, response.text
    control = await system_account_id(client, owner, bid, "cash_control")
    lines = [x for e in (await journal(client, owner, bid, response.json()["id"]))["entries"] for x in e["lines"]]
    assert sorted((x["account_id"], x["bank_account_id"], x["debit"], x["credit"]) for x in lines) == sorted([
        (control, cash["id"], "200.00", "0.00"), (control, bank["id"], "0.00", "200.00")])
    assert (await bank_account(client, owner, bid, cash["id"]))["actual_balance"] == "200.00"
    transactions = (await client.get(biz(bid, f"/bank-accounts/{bank['id']}/transactions"),
                                     headers=owner.headers)).json()
    assert {x["document_type"] for x in transactions["items"]} == {"inter_account_transfer", "opening_balance"}


async def test_transfer_to_the_same_account_rejected(client, users):
    owner, bid = await _books(client, users)
    bank = await create_bank_account(client, owner, bid)
    response = await client.post(biz(bid, "/inter-account-transfers"), headers=owner.headers, json={
        "date": DAY, "from_bank_account_id": bank["id"], "to_bank_account_id": bank["id"], "amount": "1"})
    assert response.status_code == 422 and response.json()["details"]["code"] == "same_bank_account"


async def test_void_transfer_restores_both_balances(client, users):
    owner, bid = await _books(client, users)
    bank = await create_bank_account(client, owner, bid, "100", name="Bank")
    cash = await create_bank_account(client, owner, bid, name="Cash")
    transfer = (await client.post(biz(bid, "/inter-account-transfers"), headers=owner.headers, json={
        "date": DAY, "from_bank_account_id": bank["id"], "to_bank_account_id": cash["id"], "amount": "60",
        "post": True})).json()
    voided = await client.post(biz(bid, f"/inter-account-transfers/{transfer['id']}/void"),
                               json={"version": transfer["version"]}, headers=owner.headers)
    assert voided.status_code == 200 and voided.json()["status"] == "void"
    assert (await bank_account(client, owner, bid, bank["id"]))["actual_balance"] == "100.00"
    assert (await bank_account(client, owner, bid, cash["id"]))["actual_balance"] == "0.00"


async def test_capital_account_in_use_cannot_be_deleted(client, users):
    owner, bid = await _books(client, users)
    bank = await create_bank_account(client, owner, bid)
    holder = (await client.post(biz(bid, "/capital-accounts"), json={"name": "Owner"}, headers=owner.headers)).json()
    capital = await system_account_id(client, owner, bid, "capital_control")
    body = receipt_body(bank["id"], [(capital, "10")])
    body["lines"][0]["party_id"] = holder["id"]
    assert (await client.post(biz(bid, "/receipts"), json=body, headers=owner.headers)).status_code == 201
    response = await client.delete(biz(bid, f"/capital-accounts/{holder['id']}"),
                                   params={"version": holder["version"]}, headers=owner.headers)
    parties = (await client.get(biz(bid, "/parties?kind=capital_account"), headers=owner.headers)).json()
    assert response.status_code == 409 and response.json()["details"]["code"] == "capital_account_in_use"
    assert [p["name"] for p in parties["items"]] == ["Owner"]
