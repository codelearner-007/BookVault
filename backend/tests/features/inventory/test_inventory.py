"""B6 inventory: moving-average costing, stock documents, negative stock, cost corrections, INV-4
(posting-rules PR-23, PR-26, PR-29 BV, PR-39, PR-45..PR-47, PR-62, PR-69; BV-01; CD-16, CD-17)."""

import random
from datetime import date
from decimal import Decimal

import pytest

from app.services.stock_costing import InsufficientStock, OwnedMove, cost
from tests.support.factories import add_member, create_business
from tests.support.ledger import biz, journal, set_lock_date, system_account_id, trial_balance

D = "2026-03-0{}"


@pytest.fixture
async def shop(client, users):
    owner = await users.create("admin")
    bid = (await create_business(client, owner))["id"]
    customer = (await client.post(biz(bid, "/customers"), json={"name": "Customer A"}, headers=owner.headers)).json()
    supplier = (await client.post(biz(bid, "/suppliers"), json={"name": "Supplier X"}, headers=owner.headers)).json()
    widget = await _item(client, owner, bid, "Widget", "W1")
    return owner, bid, customer["id"], supplier["id"], widget


async def _item(client, owner, bid, name, code=None) -> str:
    response = await client.post(biz(bid, "/inventory-items"), json={"name": name, "code": code},
                                 headers=owner.headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _post(client, owner, path, body, status=201):
    response = await client.post(path, json=body, headers=owner.headers)
    assert response.status_code == status, response.text
    return response.json()


async def _get(client, owner, path):
    response = await client.get(path, headers=owner.headers)
    assert response.status_code == 200, response.text
    return response.json()


async def _buy(client, owner, bid, supplier, item, qty, price, day=1, **extra):
    return await _post(client, owner, biz(bid, "/purchase-invoices"), {
        "date": D.format(day), "supplier_id": supplier, "post": True,
        "lines": [{"item_id": item, "qty": qty, "unit_price": price}], **extra})


async def _sell(client, owner, bid, customer, item, qty, price="100", day=5, status=201, **extra):
    return await _post(client, owner, biz(bid, "/sales-invoices"), {
        "date": D.format(day), "customer_id": customer, "post": True,
        "lines": [{"item_id": item, "qty": qty, "unit_price": price}], **extra}, status)


async def _stock(client, owner, bid, item) -> dict:
    return await _get(client, owner, biz(bid, f"/inventory-items/{item}"))


async def _balance(client, owner, bid, code) -> Decimal:
    account = await system_account_id(client, owner, bid, code)
    rows = (await trial_balance(client, owner, bid))["rows"]
    row = next((r for r in rows if r["account_id"] == account), None)
    return Decimal(row["debit"]) - Decimal(row["credit"]) if row else Decimal(0)


async def _cogs(client, owner, bid, document_id) -> list[tuple]:
    entries = (await journal(client, owner, bid, document_id))["entries"]
    return [(x["item_id"], x["debit"], x["credit"]) for e in entries if e["source"] == "cogs" for x in e["lines"]]


async def _assert_inv4(client, owner, bid):
    """INV-4: Inventory on hand in the GL = Σ item total cost (= Σ qty owned x average)."""
    items = (await _get(client, owner, biz(bid, "/inventory-items?page_size=100")))
    assert Decimal(items["totals"]["total_cost"]) == await _balance(client, owner, bid, "inventory_on_hand")
    assert all(Decimal(x["qty_owned"]) >= 0 for x in items["items"])


async def test_moving_average_cogs_separate_entry_and_figures(client, shop):
    """BV-01: avg = (500 + 240) / (10 + 4) per unit; COGS is its own entry (source cogs) at that average."""
    owner, bid, customer, supplier, widget = shop
    await _buy(client, owner, bid, supplier, widget, "10", "50", day=1)
    await _buy(client, owner, bid, supplier, widget, "4", "60", day=2)
    invoice = await _sell(client, owner, bid, customer, widget, "7", day=5)
    cost_line = round(Decimal(740) / 14 * 7, 2)
    assert await _cogs(client, owner, bid, invoice["id"]) == [
        (None, str(cost_line), "0.00"), (widget, "0.00", str(cost_line))]
    item = await _stock(client, owner, bid, widget)
    assert (item["qty_owned"], item["qty_on_hand"], item["qty_to_receive"], item["qty_to_deliver"]) == \
        ("7.0000", "0.0000", "14.0000", "7.0000")
    assert Decimal(item["total_cost"]) == Decimal(740) - cost_line
    await _assert_inv4(client, owner, bid)


async def test_negative_stock_rejected_cd16(client, shop):
    """CD-16 / BV-02: selling more than owned is a 409 naming item and location; nothing is stored."""
    owner, bid, customer, supplier, widget = shop
    await _buy(client, owner, bid, supplier, widget, "1", "30")
    error = await _sell(client, owner, bid, customer, widget, "3", status=409)
    assert error["details"]["code"] == "insufficient_stock"
    assert error["error"] == "Insufficient stock for W1 Widget at Default Inventory Location"
    assert (await _get(client, owner, biz(bid, "/sales-invoices")))["total"] == 0


async def test_void_purchase_consumed_by_a_sale_is_rejected(client, shop):
    owner, bid, customer, supplier, widget = shop
    bill = await _buy(client, owner, bid, supplier, widget, "2", "30")
    await _sell(client, owner, bid, customer, widget, "1")
    response = await client.post(biz(bid, f"/purchase-invoices/{bill['id']}/void"), json={"version": bill["version"]},
                                 headers=owner.headers)
    assert response.status_code == 409 and response.json()["details"]["code"] == "insufficient_stock"


async def test_back_dated_purchase_reposts_later_cogs_pr69(client, shop):
    """PR-69: a purchase dated before an existing sale changes its average: the sale's COGS entry is reversed
    and posted again, and the correction is logged."""
    owner, bid, customer, supplier, widget = shop
    await _buy(client, owner, bid, supplier, widget, "2", "30", day=1)
    invoice = await _sell(client, owner, bid, customer, widget, "2", day=5)
    assert await _cogs(client, owner, bid, invoice["id"]) == [(None, "60.00", "0.00"), (widget, "0.00", "60.00")]
    cause = await _buy(client, owner, bid, supplier, widget, "2", "60", day=3)  # back-dated: avg 45 at the sale
    entries = (await journal(client, owner, bid, invoice["id"]))["entries"]
    assert [e["source"] for e in entries].count("cogs") == 2 and [e["source"] for e in entries].count("reversal") == 1
    live = [(x["item_id"], x["debit"], x["credit"]) for x in entries[-1]["lines"]]
    assert live == [(None, "90.00", "0.00"), (widget, "0.00", "90.00")]
    corrections = (await _get(client, owner, biz(bid, "/inventory/cost-corrections")))["items"]
    assert [(c["document_id"], c["caused_by_document_id"], c["old_amount"], c["new_amount"]) for c in corrections] == \
        [(invoice["id"], cause["id"], "60.00", "90.00")]
    await _assert_inv4(client, owner, bid)


async def test_transfer_moves_on_hand_only_no_ledger_pr45(client, shop):
    owner, bid, customer, supplier, widget = shop
    await _buy(client, owner, bid, supplier, widget, "5", "10", acts_as_stock_movement=True)
    store = await _post(client, owner, biz(bid, "/inventory-locations"), {"name": "Warehouse 2"})
    default = next(x for x in (await _get(client, owner, biz(bid, "/inventory-locations")))["items"]
                   if x["is_default"])
    transfer = await _post(client, owner, biz(bid, "/inventory-transfers"), {
        "date": D.format(6), "from_location_id": default["id"], "to_location_id": store["id"], "post": True,
        "lines": [{"item_id": widget, "qty": "2"}]})
    assert (await journal(client, owner, bid, transfer["id"]))["entries"] == []
    item = await _stock(client, owner, bid, widget)
    assert {x["location_name"]: x["qty_on_hand"] for x in item["locations"]} == \
        {"Default Inventory Location": "3.0000", "Warehouse 2": "2.0000"}
    assert (item["qty_owned"], item["total_cost"]) == ("5.0000", "50.00")
    in_use = await client.delete(biz(bid, f"/inventory-locations/{store['id']}?version={store['version']}"),
                                 headers=owner.headers)
    assert in_use.status_code == 409


async def test_write_off_and_production_at_average_pr46_pr47(client, shop):
    owner, bid, customer, supplier, widget = shop
    assembly = await _item(client, owner, bid, "Assembly", "A1")
    await _buy(client, owner, bid, supplier, widget, "4", "50")
    write_off = await _post(client, owner, biz(bid, "/inventory-write-offs"), {
        "date": D.format(3), "post": True, "lines": [{"item_id": widget, "qty": "1"}]})
    assert write_off["total_cost"] == "50.00"
    labour = (await _post(client, owner, biz(bid, "/chart-of-accounts/accounts"),
                          {"name": "Labour", "type": "expense"}))["id"]
    order = await _post(client, owner, biz(bid, "/production-orders"), {
        "date": D.format(4), "post": True, "finished_item_id": assembly, "qty": "1",
        "lines": [{"item_id": widget, "qty": "2"}], "costs": [{"account_id": labour, "amount": "15"}]})
    assert (order["display_status"], order["total_cost"]) == ("completed", "100.00")
    finished = await _stock(client, owner, bid, assembly)
    assert (finished["qty_owned"], finished["average_cost"]) == ("1.0000", "115.00")
    await _assert_inv4(client, owner, bid)


async def test_kit_sale_relieves_components_pr26(client, shop):
    owner, bid, customer, supplier, widget = shop
    kit = await _post(client, owner, biz(bid, "/inventory-kits"), {
        "name": "Widget pair", "components": [{"item_id": widget, "qty": "2"}]})
    await _buy(client, owner, bid, supplier, widget, "10", "50")
    invoice = await _sell(client, owner, bid, customer, kit["id"], "1", "250")
    assert await _cogs(client, owner, bid, invoice["id"]) == [(None, "100.00", "0.00"), (widget, "0.00", "100.00")]
    assert (await _stock(client, owner, bid, widget))["qty_owned"] == "8.0000"


async def test_linked_credit_note_returns_at_cost_charged(client, shop):
    """PR-29 BV: a return linked to its invoice comes back at the cost that invoice charged, not today's average."""
    owner, bid, customer, supplier, widget = shop
    await _buy(client, owner, bid, supplier, widget, "2", "40", day=1)
    invoice = await _sell(client, owner, bid, customer, widget, "1", day=2)
    await _buy(client, owner, bid, supplier, widget, "1", "100", day=3)  # average now (40 + 100) / 2 = 70
    note = await _post(client, owner, biz(bid, "/credit-notes"), {
        "date": D.format(4), "customer_id": customer, "invoice_id": invoice["id"], "post": True,
        "lines": [{"item_id": widget, "qty": "1", "unit_price": "100"}]})
    assert await _cogs(client, owner, bid, note["id"]) == [(widget, "40.00", "0.00"), (None, "0.00", "40.00")]
    await _assert_inv4(client, owner, bid)


async def test_delivery_and_goods_receipt_move_on_hand_and_party_qty(client, shop):
    owner, bid, customer, supplier, widget = shop
    await _post(client, owner, biz(bid, "/goods-receipts"), {
        "date": D.format(1), "supplier_id": supplier, "post": True, "lines": [{"item_id": widget, "qty": "3"}]})
    await _post(client, owner, biz(bid, "/delivery-notes"), {
        "date": D.format(2), "customer_id": customer, "post": True, "lines": [{"item_id": widget, "qty": "2"}]})
    item = await _stock(client, owner, bid, widget)
    assert (item["qty_on_hand"], item["qty_owned"], item["qty_to_deliver"], item["qty_to_receive"]) == \
        ("1.0000", "0.0000", "-2.0000", "-3.0000")
    customers = (await _get(client, owner, biz(bid, "/customers")))["items"]
    suppliers = (await _get(client, owner, biz(bid, "/suppliers")))["items"]
    assert customers[0]["qty_to_deliver"] == "-2.0000" and suppliers[0]["qty_to_receive"] == "-3.0000"


async def test_inventory_starting_balance_pr62(client, shop):
    owner, bid, customer, supplier, widget = shop
    default = (await _get(client, owner, biz(bid, "/inventory-locations")))["items"][0]["id"]
    response = await client.put(biz(bid, f"/starting-balances/inventory-items/{widget}"), headers=owner.headers,
                                json={"total_cost": "250", "locations": [{"location_id": default, "qty": "5"}]})
    assert response.status_code == 200, response.text
    lines = (await journal(client, owner, bid, response.json()["document_id"]))["entries"][0]["lines"]
    retained = await system_account_id(client, owner, bid, "retained_earnings")
    assert {(x["account_id"], x["item_id"], x["debit"], x["credit"]) for x in lines} == {
        (await system_account_id(client, owner, bid, "inventory_on_hand"), widget, "250.00", "0.00"),
        (retained, None, "0.00", "250.00")}
    assert (await _stock(client, owner, bid, widget))["average_cost"] == "50.00"
    await _sell(client, owner, bid, customer, widget, "5")
    shrink = await client.put(biz(bid, f"/starting-balances/inventory-items/{widget}"), headers=owner.headers,
                              json={"total_cost": "100", "locations": [{"location_id": default, "qty": "2"}]})
    assert shrink.status_code == 409  # five were sold: the opening cannot drop to two


async def test_inventory_on_hand_needs_an_item_on_manual_journals(client, shop):
    owner, bid, *_ = shop
    on_hand = await system_account_id(client, owner, bid, "inventory_on_hand")
    retained = await system_account_id(client, owner, bid, "retained_earnings")
    response = await client.post(biz(bid, "/journal-entries"), headers=owner.headers, json={
        "date": D.format(1), "post": True, "lines": [{"account_id": on_hand, "debit": "5", "credit": "0"},
                                                    {"account_id": retained, "debit": "0", "credit": "5"}]})
    assert response.status_code == 422


async def test_lock_date_blocks_back_dated_stock_change(client, shop):
    owner, bid, customer, supplier, widget = shop
    await _buy(client, owner, bid, supplier, widget, "2", "30", day=5)
    await set_lock_date(client, owner, bid, D.format(4))
    response = await client.post(biz(bid, "/inventory-write-offs"), headers=owner.headers, json={
        "date": D.format(3), "post": True, "lines": [{"item_id": widget, "qty": "1"}]})
    assert response.status_code == 409 and response.json()["details"]["code"] == "period_locked"


async def test_member_without_inventory_rights_cannot_create_items(client, users, shop):
    owner, bid, *_ = shop
    member = await users.create_member(owner, bid)
    await add_member(client, owner, bid, member, "custom", [{"area_key": "sales_invoices", "rights": ["view"]}])
    response = await client.post(biz(bid, "/inventory-items"), json={"name": "X"}, headers=member.headers)
    assert response.status_code == 403


async def test_item_and_kit_delete_only_while_unused(client, shop):
    owner, bid, customer, supplier, widget = shop
    spare = await _stock(client, owner, bid, await _item(client, owner, bid, "Spare"))
    kit = await _post(client, owner, biz(bid, "/inventory-kits"), {
        "name": "Pair", "components": [{"item_id": widget, "qty": "2"}]})
    used = await client.delete(biz(bid, f"/inventory-items/{widget}?version=1"), headers=owner.headers)
    assert used.status_code == 409 and used.json()["details"]["code"] == "item_in_use"
    for path in (f"/inventory-kits/{kit['id']}?version={kit['version']}",
                 f"/inventory-items/{spare['id']}?version={spare['version']}"):
        assert (await client.delete(biz(bid, path), headers=owner.headers)).status_code == 204
    assert (await client.get(biz(bid, f"/inventory-items/{spare['id']}"), headers=owner.headers)).status_code == 404


# ---------------------------------------------------------------- pure costing: INV-4 property
def _moves(seed: int) -> list[OwnedMove]:
    rng = random.Random(seed)
    moves, qty = [], Decimal(0)
    for n in range(40):
        inbound = qty == 0 or rng.random() < 0.5
        q = Decimal(rng.randint(1, 9))
        if not inbound:
            q = -min(q, qty)
        amount = Decimal(rng.randint(100, 9000)) / 100 * q if inbound else Decimal(0)
        moves.append(OwnedMove(f"{n:03}", f"d{n}", "purchase_invoice" if inbound else "sales_invoice",
                               date(2026, 1, 1 + n % 28), "loc", q, amount))
        qty += q
    return moves


@pytest.mark.parametrize("seed", range(25))
def test_random_sequences_keep_value_consistent_inv4(seed):
    """Value = Σ amounts never goes negative, stock never negative, nothing left once all is sold."""
    moves = _moves(seed)
    try:
        amounts = cost(moves, 2)
    except InsufficientStock:
        return  # a reordered sequence (dates wrap) may sell before it buys: rejected, never costed negative
    qty = value = Decimal(0)
    for move in sorted(moves, key=lambda m: (m.document_date, 0 if m.qty > 0 else 1, m.id)):
        qty += move.qty
        value += amounts[move.id]
        assert qty >= 0 and value >= 0
        if qty == 0:
            assert value == 0
