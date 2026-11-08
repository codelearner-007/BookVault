"""Test data factories: auth users with a LIVE platform role, JWTs, API helpers."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
from jose import jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

TOKEN_TTL = timedelta(hours=1)
EMAIL_DOMAIN = "bookvault-test.dev"


@dataclass(frozen=True)
class TestUser:
    __test__ = False  # not a pytest test class

    id: str
    email: str
    role: str
    headers: dict[str, str]


def make_token(secret: str, user_id: str, email: str, role: str) -> str:
    """Sign a Supabase-shaped access token with the test secret (HS256)."""
    now = datetime.now(timezone.utc)
    claims = {
        "sub": user_id,
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "user_role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + TOKEN_TTL).timestamp()),
    }
    return jwt.encode(claims, secret, algorithm="HS256")


class UserFactory:
    """Insert auth.users rows; handle_new_user creates the profile, then the role is set."""

    def __init__(self, conn: AsyncConnection, secret: str) -> None:
        self.conn = conn
        self.secret = secret
        self.created: list[str] = []

    async def create(self, role: str = "admin", token_role: str | None = None) -> TestUser:
        """Create a user whose live role is `role`; the JWT claim can differ (token_role)."""
        user_id = str(uuid.uuid4())
        email = f"{user_id[:8]}@{EMAIL_DOMAIN}"
        await self.conn.execute(
            text(
                "INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,"
                " email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)"
                " VALUES (:id, '00000000-0000-0000-0000-000000000000', 'authenticated',"
                " 'authenticated', :email, '', now(), '{}', '{}', now(), now())"
            ),
            {"id": user_id, "email": email},
        )
        await self.set_role(user_id, role)
        self.created.append(user_id)
        token = make_token(self.secret, user_id, email, token_role or role)
        return TestUser(user_id, email, role, {"Authorization": f"Bearer {token}"})

    async def set_role(self, user_id: str, role: str) -> None:
        await self.conn.execute(
            text(
                "UPDATE public.user_roles SET role_id = (SELECT id FROM public.roles"
                " WHERE name = :role) WHERE user_id = :user_id"
            ),
            {"role": role, "user_id": user_id},
        )

    async def purge_created(self) -> None:
        """Mode C cleanup: remove the users this factory made and everything they own."""
        if not self.created:
            return
        params = {"ids": self.created}
        await self.conn.execute(
            text("DELETE FROM public.businesses WHERE owner_id::text = ANY(:ids)"), params
        )
        await self.conn.execute(text("DELETE FROM auth.users WHERE id::text = ANY(:ids)"), params)


async def create_business(client: httpx.AsyncClient, user: TestUser, name: str = "Acme") -> dict:
    response = await client.post("/api/v1/businesses", json={"name": name}, headers=user.headers)
    assert response.status_code == 201, response.text
    return response.json()


async def create_bank_account(
    client: httpx.AsyncClient, user: TestUser, business_id: str, opening: str = "100.00"
) -> dict:
    response = await client.post(
        f"/api/v1/businesses/{business_id}/bank-accounts",
        json={"name": "Main bank", "opening_balance": opening},
        headers=user.headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_contact(
    client: httpx.AsyncClient, user: TestUser, business_id: str, kind: str = "customers"
) -> dict:
    response = await client.post(
        f"/api/v1/businesses/{business_id}/{kind}", json={"name": "Contact"}, headers=user.headers
    )
    assert response.status_code == 201, response.text
    return response.json()


async def first_coa_account_id(client: httpx.AsyncClient, user: TestUser, business_id: str) -> str:
    response = await client.get(
        f"/api/v1/businesses/{business_id}/chart-of-accounts/accounts", headers=user.headers
    )
    assert response.status_code == 200, response.text
    return response.json()["items"][0]["id"]


async def first_coa_group_id(client: httpx.AsyncClient, user: TestUser, business_id: str) -> str:
    response = await client.get(
        f"/api/v1/businesses/{business_id}/chart-of-accounts/groups", headers=user.headers
    )
    assert response.status_code == 200, response.text
    return response.json()["items"][0]["id"]
