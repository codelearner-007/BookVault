"""Ledger test helpers: accounts, journal entries and book settings through the API (B1)."""

from __future__ import annotations

import httpx

from tests.support.factories import TestUser

# The account type BookVault uses for each golden `side`.
SIDE_TO_TYPE = {"asset": "asset", "liability": "liability", "equity": "equity",
                "income": "income", "expense": "expense"}


def biz(business_id: str, path: str) -> str:
    return f"/api/v1/businesses/{business_id}{path}"


async def create_account(client: httpx.AsyncClient, user: TestUser, business_id: str,
                         name: str, type_: str = "expense", group_id: str | None = None) -> str:
    """No group: the account goes to the root of its type."""
    body = {"name": name, "type": type_, **({"group_id": group_id} if group_id else {})}
    response = await client.post(biz(business_id, "/chart-of-accounts/accounts"), json=body, headers=user.headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def je_body(date: str, lines: list[tuple[str, str, str]], post: bool = True, **extra) -> dict:
    """lines: (account_id, debit, credit)."""
    return {"date": date, "post": post, **extra,
            "lines": [{"account_id": a, "debit": d, "credit": c} for a, d, c in lines]}


async def post_je(client, user, business_id, date, lines, post=True, **extra) -> httpx.Response:
    return await client.post(biz(business_id, "/journal-entries"),
                             json=je_body(date, lines, post, **extra), headers=user.headers)


async def set_lock_date(client, user, business_id, lock_date: str | None,
                        books_start_date: str | None = None, reason: str | None = None) -> dict:
    current = (await client.get(biz(business_id, "/settings/books"), headers=user.headers)).json()
    response = await client.put(biz(business_id, "/settings/books"), headers=user.headers, json={
        "version": current["version"],
        "books_start_date": books_start_date or current["books_start_date"],
        "lock_date": lock_date,
        "reason": reason,
    })
    assert response.status_code == 200, response.text
    return response.json()


async def journal(client, user, business_id, document_id) -> dict:
    response = await client.get(biz(business_id, f"/documents/{document_id}/journal"), headers=user.headers)
    assert response.status_code == 200, response.text
    return response.json()


async def trial_balance(client, user, business_id, as_at: str = "2100-12-31") -> dict:
    response = await client.get(biz(business_id, f"/reports/trial-balance?as_at={as_at}"), headers=user.headers)
    assert response.status_code == 200, response.text
    return response.json()


def _tree_nodes(nodes: list[dict]):
    for node in nodes:
        yield node
        yield from _tree_nodes(node["groups"])


async def system_account_id(client, user, business_id, code: str) -> str:
    """The id of a seeded system account (cash_control, suspense, capital_control, ...)."""
    response = await client.get(biz(business_id, "/chart-of-accounts/tree?as_at=2100-12-31&include_hidden=true"),
                                headers=user.headers)
    assert response.status_code == 200, response.text
    return next(a["id"] for n in _tree_nodes(response.json()["roots"]) for a in n["accounts"]
                if a["system_account_code"] == code)


async def bank_account(client, user, business_id, bank_account_id) -> dict:
    response = await client.get(biz(business_id, f"/bank-accounts/{bank_account_id}"), headers=user.headers)
    assert response.status_code == 200, response.text
    return response.json()
