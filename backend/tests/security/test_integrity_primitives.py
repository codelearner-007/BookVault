"""B0.5 integrity primitives: idempotency (AC-19), optimistic locking (AC-20), server totals
(AC-22), append-only audit (AC-24), pagination caps (AC-25), CSRF (AC-28), strict input
(AC-03, AC-32), error hygiene (AC-27, AC-31), live identity (AC-12, AC-13), rate limits."""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import httpx
import pytest
from jose import jwt
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.core.config import settings
from app.main import app
from tests.conftest import TEST_JWT_SECRET
from tests.support.factories import create_bank_account, create_business, create_contact, receipt_body
from tests.support.ledger import create_account

KEY = "Idempotency-Key"


def _biz(business_id: str, part: str) -> str:
    return f"/api/v1/businesses/{business_id}/{part}"


async def _owner_business(client, users):
    owner = await users.create()
    return owner, (await create_business(client, owner))["id"]


async def _receipt_setup(client, owner, business_id) -> tuple[str, str]:
    """A bank account and an income account (B3 receipts need both)."""
    bank = await create_bank_account(client, owner, business_id)
    return bank["id"], await create_account(client, owner, business_id, "Service income", "income")


async def _audit_rows(db_conn, business_id: str, entity_type: str) -> list:
    result = await db_conn.execute(text(
        "SELECT action, before, after, scope, request_id FROM audit_logs"
        " WHERE business_id = CAST(:b AS uuid) AND entity_type = :e ORDER BY created_at, id"
    ), {"b": business_id, "e": entity_type})
    return list(result.all())


# ------------------------------------------------------------------ AC-19 idempotency


async def test_same_idempotency_key_returns_same_receipt(client, users, db_conn):
    owner, business_id = await _owner_business(client, users)
    headers = {**owner.headers, KEY: str(uuid.uuid4())}
    bank, income = await _receipt_setup(client, owner, business_id)
    body = receipt_body(bank, [(income, "5")])

    first = await client.post(_biz(business_id, "receipts"), json=body, headers=headers)
    replay = await client.post(_biz(business_id, "receipts"), json=body, headers=headers)
    count = await db_conn.execute(text(
        "SELECT count(*) FROM cash_transactions WHERE business_id = CAST(:b AS uuid)"), {"b": business_id})

    assert (first.status_code, replay.status_code) == (201, 201)
    assert replay.json() == first.json()
    assert count.scalar() == 1


async def test_same_key_different_body_409(client, users):
    owner, business_id = await _owner_business(client, users)
    headers = {**owner.headers, KEY: str(uuid.uuid4())}

    await client.post(_biz(business_id, "customers"), json={"name": "A"}, headers=headers)
    reused = await client.post(_biz(business_id, "customers"), json={"name": "B"}, headers=headers)

    assert reused.status_code == 409
    assert reused.json()["details"]["code"] == "idempotency_key_reused"


async def test_missing_idempotency_key_400(client, users):
    owner, business_id = await _owner_business(client, users)

    response = await client.post(
        _biz(business_id, "customers"), json={"name": "A"}, headers={**owner.headers, KEY: " "}
    )

    assert response.status_code == 400
    assert response.json()["details"]["code"] == "idempotency_key_required"


async def test_idempotency_keys_are_per_user(client, users):
    owner, business_id = await _owner_business(client, users)
    other, other_business = await _owner_business(client, users)
    key = str(uuid.uuid4())

    mine = await client.post(_biz(business_id, "customers"), json={"name": "A"},
                             headers={**owner.headers, KEY: key})
    theirs = await client.post(_biz(other_business, "customers"), json={"name": "A"},
                               headers={**other.headers, KEY: key})

    assert (mine.status_code, theirs.status_code) == (201, 201)
    assert mine.json()["id"] != theirs.json()["id"]


# ------------------------------------------------------------------ AC-20 optimistic locking


async def test_update_with_stale_version_409(client, users):
    owner, business_id = await _owner_business(client, users)
    contact = await create_contact(client, owner, business_id)
    url = _biz(business_id, f"customers/{contact['id']}")

    first = await client.put(url, json={"name": "First", "version": contact["version"]},
                             headers=owner.headers)
    stale = await client.put(url, json={"name": "Second", "version": contact["version"]},
                             headers=owner.headers)

    assert first.status_code == 200 and first.json()["version"] == contact["version"] + 1
    assert stale.status_code == 409
    assert stale.json()["details"]["code"] == "version_conflict"
    assert (await client.get(url, headers=owner.headers)).json()["name"] == "First"


async def test_delete_with_stale_version_409(client, users):
    owner, business_id = await _owner_business(client, users)
    account = await create_bank_account(client, owner, business_id)
    url = _biz(business_id, f"bank-accounts/{account['id']}")
    await client.put(url, json={"name": "Moved on", "version": account["version"]}, headers=owner.headers)

    stale = await client.delete(url, params={"version": account["version"]}, headers=owner.headers)
    missing = await client.delete(url, headers=owner.headers)

    assert stale.status_code == 409
    assert missing.status_code == 422
    assert (await client.get(url, headers=owner.headers)).status_code == 200


async def test_business_update_requires_current_version(client, users):
    owner = await users.create()
    business = await create_business(client, owner)
    url = f"/api/v1/businesses/{business['id']}"

    ok = await client.put(url, json={"name": "N1", "version": business["version"]}, headers=owner.headers)
    stale = await client.put(url, json={"name": "N2", "version": business["version"]}, headers=owner.headers)

    assert (ok.status_code, stale.status_code) == (200, 409)


# ------------------------------------------------------------------ AC-22 money


async def test_client_total_ignored(client, users):
    """No client total is accepted (strict schema); line amounts and the total come from the server."""
    owner, business_id = await _owner_business(client, users)
    bank, income = await _receipt_setup(client, owner, business_id)
    body = receipt_body(bank, [(income, "10.005"), (income, "-0.125")])
    body["lines"][0].update(qty="3", discount="1")

    with_total = await client.post(_biz(business_id, "receipts"), headers=owner.headers,
                                   json={**body, "lines": [{**body["lines"][0], "total": "999"}]})
    created = await client.post(_biz(business_id, "receipts"), json=body, headers=owner.headers)

    receipt = created.json()
    assert with_total.status_code == 422
    assert created.status_code == 201, created.text
    # 10.005 * 3 - 1 = 29.015 -> 29.02 ; -0.125 -> -0.13 (half away from zero)
    assert [Decimal(line["amount"]) for line in receipt["lines"]] == [Decimal("29.02"), Decimal("-0.13")]
    assert Decimal(receipt["total"]) == Decimal("28.89")
    assert isinstance(receipt["lines"][0]["amount"], str)


async def test_bank_balance_is_a_decimal_string(client, users):
    owner, business_id = await _owner_business(client, users)
    account = await create_bank_account(client, owner, business_id, "0.1")

    listed = (await client.get(_biz(business_id, "bank-accounts"), headers=owner.headers)).json()

    assert account["actual_balance"] == "0.10"
    assert listed["totals"]["actual_balance"] == "0.10"


async def test_money_over_precision_rejected_422(client, users):
    owner, business_id = await _owner_business(client, users)

    bank, income = await _receipt_setup(client, owner, business_id)
    response = await client.post(
        _biz(business_id, "receipts"), json=receipt_body(bank, [(income, "1.00001")]), headers=owner.headers,
    )

    assert response.status_code == 422


# ------------------------------------------------------------------ AC-24 audit


@pytest.mark.parametrize("entity", ["Customer", "BankAccount", "Receipt", "CoaGroup", "TabColumns",
                                    "BusinessTabs", "Business"])
async def test_audit_row_written_for_every_mutation(client, users, db_conn, entity):
    owner, business_id = await _owner_business(client, users)
    if entity == "Customer":
        contact = await create_contact(client, owner, business_id)
        url = _biz(business_id, f"customers/{contact['id']}")
        updated = await client.put(url, json={"name": "X", "version": contact["version"]}, headers=owner.headers)
        await client.delete(url, params={"version": updated.json()["version"]}, headers=owner.headers)
        expected = ["create", "update", "delete"]
    elif entity == "BankAccount":
        await create_bank_account(client, owner, business_id)
        expected = ["create"]
    elif entity == "Receipt":
        bank, income = await _receipt_setup(client, owner, business_id)
        await client.post(_biz(business_id, "receipts"), json=receipt_body(bank, [(income, "1")]),
                          headers=owner.headers)
        expected = ["create"]
    elif entity == "CoaGroup":
        groups = await client.get(_biz(business_id, "chart-of-accounts/groups"), headers=owner.headers)
        income = next(g["id"] for g in groups.json()["items"] if g["root_key"] == "income")
        group = await client.post(_biz(business_id, "chart-of-accounts/groups"),
                                  json={"name": "G", "type": "pl", "parent_group_id": income}, headers=owner.headers)
        await client.put(_biz(business_id, "chart-of-accounts/groups/order"),
                         json={"type": "pl", "parent_group_id": income, "items": [group.json()["id"]]},
                         headers=owner.headers)
        expected = ["create", "reorder"]
    elif entity == "TabColumns":
        await client.put(_biz(business_id, "tab-columns/customers"),
                         json={"columns": [{"col_key": "name", "visible": True, "order_index": 0}]},
                         headers=owner.headers)
        expected = ["update"]
    elif entity == "BusinessTabs":
        await client.put(_biz(business_id, "tabs"), json={"items": [{"key": "summary", "enabled": True}]},
                         headers=owner.headers)
        expected = ["update"]
    else:
        expected = ["create"]

    rows = await _audit_rows(db_conn, business_id, entity)

    assert [r.action for r in rows] == expected
    assert all(r.scope == "business" and r.request_id for r in rows)
    assert rows[0].after is not None or rows[0].before is not None
    if entity == "Customer":
        assert rows[1].before["name"] == "Contact" and rows[1].after["name"] == "X"


async def test_audit_update_and_delete_blocked(client, users, db_conn):
    owner, business_id = await _owner_business(client, users)

    for statement in ("UPDATE audit_logs SET action = 'forged' WHERE business_id = CAST(:b AS uuid)",
                      "DELETE FROM audit_logs WHERE business_id = CAST(:b AS uuid)"):
        async with db_conn.begin_nested() as savepoint:
            with pytest.raises(DBAPIError, match="append-only"):
                await db_conn.execute(text(statement), {"b": business_id})
            await savepoint.rollback()


@pytest.mark.parametrize("role", ["authenticated", "anon", "bookvault_api"])
async def test_authenticated_cannot_insert_audit(db_conn, role):
    async with db_conn.begin_nested() as savepoint:
        await db_conn.execute(text(f"SET LOCAL ROLE {role}"))
        with pytest.raises(DBAPIError):
            # bookvault_api may insert only as app.user_id, which is unset here
            await db_conn.execute(text(
                "INSERT INTO audit_logs (user_id, action, entity_type) VALUES (gen_random_uuid(), 'x', 'y')"
            ))
        await savepoint.rollback()


async def test_business_history_lists_business_rows(client, users):
    owner, business_id = await _owner_business(client, users)
    await create_contact(client, owner, business_id)

    history = await client.get(_biz(business_id, "history"), headers=owner.headers)

    assert history.status_code == 200
    assert {r["entity_type"] for r in history.json()["items"]} >= {"Business", "Customer"}
    assert {r["business_id"] for r in history.json()["items"]} == {business_id}


# ------------------------------------------------------------------ AC-25 / AC-32 / AC-03 input


async def test_page_size_capped_at_max(client, users):
    owner, business_id = await _owner_business(client, users)
    url = _biz(business_id, "customers")

    at_max = await client.get(url, params={"page_size": settings.PAGE_SIZE_MAX}, headers=owner.headers)
    over = await client.get(url, params={"page_size": settings.PAGE_SIZE_MAX + 1}, headers=owner.headers)

    assert at_max.status_code == 200 and at_max.json()["page_size"] == settings.PAGE_SIZE_MAX
    assert over.status_code == 422


async def test_list_pages_are_disjoint(client, users):
    owner, business_id = await _owner_business(client, users)
    for _ in range(3):
        await create_contact(client, owner, business_id)
    url = _biz(business_id, "customers")

    pages = [(await client.get(url, params={"page": p, "page_size": 2}, headers=owner.headers)).json()
             for p in (1, 2)]

    assert [len(p["items"]) for p in pages] == [2, 1]
    assert pages[0]["total"] == 3 and pages[0]["total_pages"] == 2
    assert not {c["id"] for c in pages[0]["items"]} & {c["id"] for c in pages[1]["items"]}


async def test_oversized_list_rejected_422(client, users):
    owner, business_id = await _owner_business(client, users)
    bank, income = await _receipt_setup(client, owner, business_id)

    response = await client.post(_biz(business_id, "receipts"), headers=owner.headers,
                                 json=receipt_body(bank, [(income, "1")] * 501))

    assert response.status_code == 422


async def test_oversized_string_rejected_422(client, users):
    owner, business_id = await _owner_business(client, users)

    response = await client.post(_biz(business_id, "customers"), json={"name": "x" * 201},
                                 headers=owner.headers)

    assert response.status_code == 422


@pytest.mark.parametrize("field", ["business_id", "is_system", "version", "unknown"])
async def test_payload_with_unknown_field_rejected_422(client, users, field):
    owner, business_id = await _owner_business(client, users)

    response = await client.post(_biz(business_id, "chart-of-accounts/accounts"),
                                 json={"name": "A", field: business_id}, headers=owner.headers)

    assert response.status_code == 422


async def test_validation_error_does_not_echo_input(client, users):
    owner, business_id = await _owner_business(client, users)
    secret = "s3cr3t-value"

    response = await client.post(_biz(business_id, "customers"), json={"name": "A", "x": secret},
                                 headers=owner.headers)

    assert response.status_code == 422 and secret not in response.text


async def test_unknown_tab_key_rejected_422(client, users):
    owner, business_id = await _owner_business(client, users)

    response = await client.put(_biz(business_id, "tabs"), json={"items": [{"key": "nope", "enabled": True}]},
                                headers=owner.headers)

    assert response.status_code == 422


async def test_child_tab_requires_parent(client, users, db_conn):
    owner, business_id = await _owner_business(client, users)
    super_admin = await users.create("super_admin")
    catalog = (await client.get("/api/v1/admin-tabs", headers=super_admin.headers)).json()["items"]
    items = [{k: t[k] for k in ("key", "label", "enabled", "default_enabled", "parent_key")} for t in catalog]
    items.append({"key": "child-tab", "label": "Child", "enabled": True, "default_enabled": False,
                  "parent_key": "customers"})
    saved = await client.put("/api/v1/admin-tabs", json={"items": items}, headers=super_admin.headers)

    orphan = await client.put(_biz(business_id, "tabs"), headers=owner.headers, json={"items": [
        {"key": "customers", "enabled": False}, {"key": "child-tab", "enabled": True}]})
    both = await client.put(_biz(business_id, "tabs"), headers=owner.headers, json={"items": [
        {"key": "customers", "enabled": True}, {"key": "child-tab", "enabled": True}]})

    assert saved.status_code == 200, saved.text
    assert orphan.status_code == 422
    assert both.status_code == 200
    assert {t["key"]: t["parent_key"] for t in both.json()["items"]}["child-tab"] == "customers"


async def test_receipt_tab_key_renamed(client, users):
    super_admin = await users.create("super_admin")

    keys = {t["key"] for t in (await client.get("/api/v1/admin-tabs", headers=super_admin.headers)).json()["items"]}

    assert "receipts" in keys and "receipt" not in keys


async def test_countries_reference_is_paginated_and_searchable(client, users):
    user = await users.create()

    first = await client.get("/api/v1/countries", params={"page_size": 100}, headers=user.headers)
    found = await client.get("/api/v1/countries", params={"search": "pakis"}, headers=user.headers)

    assert first.json()["total"] > 100 and len(first.json()["items"]) == 100
    assert [c["code"] for c in found.json()["items"]] == ["PK"]


# ------------------------------------------------------------------ AC-28 CSRF


async def test_fastapi_mutation_with_foreign_origin_403(client, users):
    owner = await users.create()
    headers = {**owner.headers, "Origin": "https://evil.example"}

    response = await client.post("/api/v1/businesses", json={"name": "X"}, headers=headers)
    no_header = await _without_csrf_header(client, "POST", "/api/v1/businesses", headers)
    allowed = await _without_csrf_header(
        client, "POST", "/api/v1/businesses",
        {**owner.headers, "Origin": settings.ALLOWED_ORIGINS[0]},
    )

    assert response.status_code == 201  # the app header is present
    assert no_header.status_code == 403 and no_header.json()["details"]["code"] == "csrf_rejected"
    assert allowed.status_code == 201


async def _without_csrf_header(client, method, url, headers):
    request = client.build_request(method, url, json={"name": "X"}, headers=headers)
    del request.headers[settings.CSRF_HEADER]
    request.headers[KEY] = str(uuid.uuid4())
    return await client.send(request)


# ------------------------------------------------------------------ AC-27 / AC-31 errors


async def test_500_response_has_no_exception_text(client, users, monkeypatch):
    owner = await users.create()

    async def boom(*_args, **_kwargs):
        raise RuntimeError("SELECT secret FROM internals")

    monkeypatch.setattr("app.services.country_service.CountryService.list_page", boom)
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as raw:
        response = await raw.get("/api/v1/countries", headers=owner.headers)

    assert response.status_code == 500
    assert "secret" not in response.text and response.json()["request_id"]
    assert response.headers["X-Request-ID"] == response.json()["request_id"]


async def test_403_response_has_no_permission_details(client, users):
    user = await users.create()

    response = await client.get("/api/v1/admin-tabs", headers=user.headers)

    assert response.status_code == 403
    assert "super_admin" not in response.text and response.json()["details"] == {}


async def test_docs_disabled_outside_development(client):
    assert settings.docs_enabled is False
    assert (await client.get("/docs")).status_code == 404
    assert (await client.get("/openapi.json")).status_code == 404


# ------------------------------------------------------------------ AC-12 / AC-13 live identity


async def test_banned_user_token_rejected(client, users, db_conn):
    user = await users.create()
    await db_conn.execute(text(
        "UPDATE auth.users SET banned_until = now() + interval '1 hour' WHERE id = CAST(:u AS uuid)"
    ), {"u": user.id})

    response = await client.get("/api/v1/businesses", headers=user.headers)

    assert response.status_code == 401


def _token(user, aal: str) -> dict:
    now = datetime.now(timezone.utc)
    claims = {"sub": user.id, "email": user.email, "aud": "authenticated", "role": "authenticated",
              "user_role": user.role, "aal": aal, "iat": int(now.timestamp()),
              "exp": int((now + timedelta(hours=1)).timestamp())}
    return {"Authorization": f"Bearer {jwt.encode(claims, TEST_JWT_SECRET, algorithm='HS256')}"}


async def test_aal1_token_rejected_when_mfa_enrolled(client, users, db_conn):
    user = await users.create()
    await db_conn.execute(text(
        "INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)"
        " VALUES (gen_random_uuid(), CAST(:u AS uuid), 'phone', 'totp', 'verified', now(), now())"
    ), {"u": user.id})

    aal1 = await client.get("/api/v1/businesses", headers=_token(user, "aal1"))
    aal2 = await client.get("/api/v1/businesses", headers=_token(user, "aal2"))

    assert aal1.status_code == 403 and aal1.json()["details"]["code"] == "mfa_required"
    assert aal2.status_code == 200


# ------------------------------------------------------------------ AC-25 rate limits


async def test_mutations_rate_limited_per_user(client, users, monkeypatch):
    owner, business_id = await _owner_business(client, users)
    other, other_business = await _owner_business(client, users)
    monkeypatch.setattr(settings, "MUTATION_RATE_LIMIT", "2/minute")

    codes = [(await client.post(_biz(business_id, "customers"), json={"name": f"C{i}"},
                                headers=owner.headers)).status_code for i in range(3)]
    other_code = (await client.post(_biz(other_business, "customers"), json={"name": "C"},
                                    headers=other.headers)).status_code

    assert codes == [201, 201, 429]
    assert other_code == 201
