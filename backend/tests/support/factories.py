"""Test data factories: auth users with a LIVE platform role, JWTs, API helpers."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
from jose import jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

TOKEN_TTL = timedelta(hours=1)
EMAIL_DOMAIN = "bookvault-test.dev"
SUPER_ADMIN_AAL = "aal2"


@dataclass(frozen=True)
class TestUser:
    __test__ = False  # not a pytest test class

    id: str
    email: str
    role: str
    headers: dict[str, str]


def make_token(
    secret: str,
    user_id: str,
    email: str,
    role: str | None,
    app_metadata: dict | None = None,
    extra: dict | None = None,
) -> str:
    """Sign a Supabase-shaped access token with the test secret (HS256)."""
    now = datetime.now(timezone.utc)
    claims = {
        "app_metadata": app_metadata or {},
        "sub": user_id,
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        **({"user_role": role} if role else {}),
        "iat": int(now.timestamp()),
        "exp": int((now + TOKEN_TTL).timestamp()),
        **(extra or {}),
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
        # The platform routes need an AAL2 super admin session (B0.7, mfa_required_for_super_admin).
        extra = {"aal": SUPER_ADMIN_AAL} if role == "super_admin" else None
        token = make_token(self.secret, user_id, email, token_role or role, extra=extra)
        return TestUser(user_id, email, role, {"Authorization": f"Bearer {token}"})

    async def create_member(
        self, creator: TestUser, business_id: str, must_change_password: bool = False
    ) -> TestUser:
        """A business user as the Next.js route creates it: provisioned by the business owner."""
        user_id = str(uuid.uuid4())
        email = f"{user_id[:8]}@{EMAIL_DOMAIN}"
        app_metadata = {"provisioned_for_business": business_id, "created_by_user_id": creator.id}
        await self.conn.execute(
            text(
                "INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,"
                " email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)"
                " VALUES (:id, '00000000-0000-0000-0000-000000000000', 'authenticated',"
                " 'authenticated', :email, '', now(), CAST(:meta AS jsonb), '{}', now(), now())"
            ),
            {"id": user_id, "email": email, "meta": json.dumps(app_metadata)},
        )
        self.created.append(user_id)
        token = make_token(
            self.secret, user_id, email, "member",
            {"must_change_password": must_change_password},
        )
        return TestUser(user_id, email, "member", {"Authorization": f"Bearer {token}"})

    async def set_role(self, user_id: str, role: str) -> None:
        await self.conn.execute(
            text(
                "UPDATE public.user_roles SET role_id = (SELECT id FROM public.roles"
                " WHERE name = :role) WHERE user_id = :user_id"
            ),
            {"role": role, "user_id": user_id},
        )

    async def purge_created(self) -> None:
        """Mode C cleanup: purge their businesses (audited purge, B0.8), then the users."""
        if not self.created:
            return
        params = {"ids": self.created}
        owned = await self.conn.execute(
            text("SELECT id::text, name, owner_id::text FROM public.businesses"
                 " WHERE owner_id::text = ANY(:ids)"),
            params,
        )
        for business_id, name, owner_id in owned.all():
            await purge_business(self.conn, business_id, owner_id, name)
        await self.conn.execute(text("DELETE FROM auth.users WHERE id::text = ANY(:ids)"), params)


async def purge_business(conn: AsyncConnection, business_id: str, owner_id: str, name: str) -> dict:
    """Trash + purge a business as its owner through the API role, on an autocommit connection."""
    await conn.execute(
        text("UPDATE public.businesses SET deleted_at = COALESCE(deleted_at, now()) WHERE id = :id"),
        {"id": business_id},
    )
    await conn.execute(text("SET ROLE bookvault_api"))
    try:
        await conn.execute(text("SELECT set_config('app.user_id', :uid, false)"), {"uid": owner_id})
        result = await conn.execute(
            text("SELECT public.purge_business(CAST(:id AS uuid), CAST(:uid AS uuid), :name)"),
            {"id": business_id, "uid": owner_id, "name": name},
        )
        return result.scalar_one()
    finally:
        await conn.execute(text("RESET ROLE"))
        await conn.execute(text("SELECT set_config('app.user_id', '', false)"))


# Tests post documents on fixed dates; the books must start before them (documents dated
# before books_start_date are rejected, B2).
TEST_BOOKS_START = "2020-01-01"


async def create_business(client: httpx.AsyncClient, user: TestUser, name: str = "Acme") -> dict:
    response = await client.post("/api/v1/businesses", json={"name": name, "books_start_date": TEST_BOOKS_START},
                                 headers=user.headers)
    assert response.status_code == 201, response.text
    return response.json()


async def create_bank_account(
    client: httpx.AsyncClient, user: TestUser, business_id: str, opening: str | None = None,
    name: str = "Main bank", **fields,
) -> dict:
    """A bank or cash account; `opening` = its starting balance (debit), posted as its opening entry."""
    base = f"/api/v1/businesses/{business_id}"
    response = await client.post(f"{base}/bank-accounts", json={"name": name, **fields}, headers=user.headers)
    assert response.status_code == 201, response.text
    if opening is not None:
        sb = await client.put(f"{base}/starting-balances/bank-accounts/{response.json()['id']}",
                              json={"side": "debit", "amount": opening}, headers=user.headers)
        assert sb.status_code == 200, sb.text
        return (await client.get(f"{base}/bank-accounts/{response.json()['id']}", headers=user.headers)).json()
    return response.json()


def receipt_body(bank_account_id: str, lines: list[tuple[str, str]], post: bool = True,
                 date: str = "2026-11-08", **fields) -> dict:
    """lines: (account_id, unit_price)."""
    return {"date": date, "bank_account_id": bank_account_id, "post": post, **fields,
            "lines": [{"account_id": a, "unit_price": p} for a, p in lines]}


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


async def add_member(
    client: httpx.AsyncClient,
    owner: TestUser,
    business_id: str,
    member: TestUser,
    access_mode: str = "custom",
    areas: list[dict] | None = None,
) -> dict:
    response = await client.post(
        f"/api/v1/businesses/{business_id}/members",
        json={"user_id": member.id, "access_mode": access_mode, "areas": areas or []},
        headers=owner.headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def put_access(
    client: httpx.AsyncClient, owner: TestUser, business_id: str, member_row: dict, **body
) -> httpx.Response:
    current = await client.get(
        f"/api/v1/businesses/{business_id}/members/{member_row['id']}/access", headers=owner.headers
    )
    payload = {"access_mode": "custom", "version": current.json()["version"], "areas": [], **body}
    return await client.put(
        f"/api/v1/businesses/{business_id}/members/{member_row['id']}/access",
        json=payload,
        headers=owner.headers,
    )
