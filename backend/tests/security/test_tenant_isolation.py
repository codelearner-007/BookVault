"""Tenant isolation (threat-model AC-01, AC-02, AC-06; CS-01, CS-05, CS-08)."""

import pytest

from tests.support.factories import (
    create_bank_account,
    create_business,
    create_contact,
    first_coa_account_id,
    first_coa_group_id,
    receipt_body,
)
from tests.support.ledger import create_account
from tests.support.tenancy import business_routes, has_business_access_dependency, request_as

BUSINESS_ROUTES = business_routes()
ROUTE_IDS = [r.id for r in BUSINESS_ROUTES]


def test_route_inventory_all_business_routes_have_access_dependency():
    missing = [r.id for r in BUSINESS_ROUTES if not has_business_access_dependency(r.route)]
    assert BUSINESS_ROUTES, "no business routes found"
    assert missing == []


@pytest.mark.parametrize("business_route", BUSINESS_ROUTES, ids=ROUTE_IDS)
async def test_non_member_gets_404(client, users, business_route):
    owner, stranger = await users.create(), await users.create()
    victim = await create_business(client, owner)

    response = await request_as(client, stranger, business_route, victim["id"])

    assert response.status_code == 404, response.text


@pytest.mark.parametrize("business_route", BUSINESS_ROUTES, ids=ROUTE_IDS)
async def test_malformed_business_id_gets_404(client, users, business_route):
    user = await users.create()

    response = await request_as(client, user, business_route, "not-a-uuid")

    assert response.status_code == 404, response.text


# Trash routes: restore, the export offered before a purge, and the purge itself (B0.8).
TRASH_SUFFIXES = ("/permanent", "/restore", "/export")


@pytest.mark.parametrize(
    "business_route",
    [r for r in BUSINESS_ROUTES if not r.path.endswith(TRASH_SUFFIXES)],
    ids=[r.id for r in BUSINESS_ROUTES if not r.path.endswith(TRASH_SUFFIXES)],
)
async def test_deleted_business_returns_404_on_all_routes(client, users, business_route):
    owner = await users.create()
    business = await create_business(client, owner)
    deleted = await client.delete(f"/api/v1/businesses/{business['id']}", headers=owner.headers)
    assert deleted.status_code == 204, deleted.text

    response = await request_as(client, owner, business_route, business["id"])

    assert response.status_code == 404, response.text


async def test_deleted_business_can_still_be_restored(client, users):
    owner = await users.create()
    business = await create_business(client, owner)
    await client.delete(f"/api/v1/businesses/{business['id']}", headers=owner.headers)

    response = await client.post(
        f"/api/v1/businesses/{business['id']}/restore", headers=owner.headers
    )

    assert response.status_code == 200, response.text


async def _two_tenants(client, users):
    owner_a, owner_b = await users.create(), await users.create()
    business_a = await create_business(client, owner_a, "A")
    business_b = await create_business(client, owner_b, "B")
    return owner_a, business_a["id"], business_b, owner_b


async def _receipt_books(client, owner, business_id) -> tuple[str, str]:
    bank = await create_bank_account(client, owner, business_id)
    return bank["id"], await create_account(client, owner, business_id, "Service income", "income")


async def test_receipt_with_foreign_bank_account_rejected(client, users):
    owner_a, business_a, business_b, owner_b = await _two_tenants(client, users)
    foreign_account = await create_bank_account(client, owner_b, business_b["id"])
    _, income = await _receipt_books(client, owner_a, business_a)

    response = await client.post(f"/api/v1/businesses/{business_a}/receipts", headers=owner_a.headers,
                                 json=receipt_body(foreign_account["id"], [(income, "10")]))

    assert response.status_code == 422, response.text
    balance = await client.get(
        f"/api/v1/businesses/{business_b['id']}/bank-accounts/{foreign_account['id']}",
        headers=owner_b.headers,
    )
    assert balance.json()["actual_balance"] == foreign_account["actual_balance"]


async def test_receipt_with_foreign_contact_rejected(client, users):
    owner_a, business_a, business_b, owner_b = await _two_tenants(client, users)
    foreign_customer = await create_contact(client, owner_b, business_b["id"])
    bank, income = await _receipt_books(client, owner_a, business_a)

    response = await client.post(f"/api/v1/businesses/{business_a}/receipts", headers=owner_a.headers,
                                 json=receipt_body(bank, [(income, "1")], counterparty_party_id=foreign_customer["id"]))

    assert response.status_code == 422, response.text


async def test_receipt_line_with_foreign_coa_account_rejected(client, users):
    owner_a, business_a, business_b, owner_b = await _two_tenants(client, users)
    foreign_coa = await first_coa_account_id(client, owner_b, business_b["id"])
    bank, _ = await _receipt_books(client, owner_a, business_a)

    response = await client.post(f"/api/v1/businesses/{business_a}/receipts", headers=owner_a.headers,
                                 json=receipt_body(bank, [(foreign_coa, "10")]))

    assert response.status_code == 422, response.text


async def test_receipt_update_cannot_point_at_foreign_bank_account(client, users):
    owner_a, business_a, business_b, owner_b = await _two_tenants(client, users)
    foreign_account = await create_bank_account(client, owner_b, business_b["id"])
    bank, income = await _receipt_books(client, owner_a, business_a)
    body = receipt_body(bank, [(income, "4")], post=False)
    created = (await client.post(f"/api/v1/businesses/{business_a}/receipts", json=body,
                                 headers=owner_a.headers)).json()

    response = await client.put(
        f"/api/v1/businesses/{business_a}/receipts/{created['id']}", headers=owner_a.headers,
        json={**{k: v for k, v in body.items() if k != "post"}, "version": created["version"],
              "bank_account_id": foreign_account["id"]},
    )

    assert response.status_code == 422, response.text


async def test_coa_account_with_foreign_group_rejected(client, users):
    owner_a, business_a, business_b, owner_b = await _two_tenants(client, users)
    foreign_group = await first_coa_group_id(client, owner_b, business_b["id"])

    response = await client.post(
        f"/api/v1/businesses/{business_a}/chart-of-accounts/accounts",
        json={"name": "Leak", "group_id": foreign_group},
        headers=owner_a.headers,
    )

    assert response.status_code == 422, response.text


async def test_coa_group_with_foreign_parent_rejected(client, users):
    owner_a, business_a, business_b, owner_b = await _two_tenants(client, users)
    foreign_group = await first_coa_group_id(client, owner_b, business_b["id"])

    response = await client.post(
        f"/api/v1/businesses/{business_a}/chart-of-accounts/groups",
        json={"name": "Leak", "type": "balance_sheet", "parent_group_id": foreign_group},
        headers=owner_a.headers,
    )

    assert response.status_code == 422, response.text
