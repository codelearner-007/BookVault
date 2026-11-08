"""Ledger test helpers: accounts, journal entries and book settings through the API (B1)."""

from __future__ import annotations

import httpx

from tests.support.factories import TestUser

# The account type BookVault uses for each golden `side` (COA types, until B2's system types).
SIDE_TO_TYPE = {"asset": "asset", "liability": "liability", "equity": "equity",
                "income": "income", "expense": "expense"}


def biz(business_id: str, path: str) -> str:
    return f"/api/v1/businesses/{business_id}{path}"


async def create_account(client: httpx.AsyncClient, user: TestUser, business_id: str,
                         name: str, type_: str = "expense") -> str:
    response = await client.post(biz(business_id, "/chart-of-accounts/accounts"),
                                 json={"name": name, "type": type_}, headers=user.headers)
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
