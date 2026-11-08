"""Direct GoTrue tests (B0.7, AC-36…AC-38, AC-45): the public anon key, no Next.js, no FastAPI.

They run against the local Supabase stack (mode C: real accounts, deleted afterwards with
the admin API). The dev database is read only to trigger the audit ingest and to age a
link for the expiry test. Skipped when the stack is not reachable.
"""

from __future__ import annotations

import os
import re
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

REPO_ROOT = Path(__file__).resolve().parents[3]
GOTRUE_URL = os.environ.get("TEST_GOTRUE_URL", "http://127.0.0.1:55341/auth/v1")
MAILPIT_URL = os.environ.get("TEST_MAILPIT_URL", "http://127.0.0.1:55344/api/v1")
DEV_DATABASE_URL = os.environ.get(
    "TEST_DEV_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@127.0.0.1:55342/postgres"
)
EMAIL_DOMAIN = "gotrue-test.bookvault.dev"
STRONG_PASSWORD = "correct horse battery staple"
VERIFY_LINK = re.compile(r"https?://[^\s\"'<>]+/auth/v1/verify\?[^\s\"'<>)]+")


def _env_file_value(path: Path, name: str) -> str | None:
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip()
    return None


def _key(env_name: str, file_name: str) -> str | None:
    return os.environ.get(env_name) or _env_file_value(REPO_ROOT / "frontend" / ".env.local", file_name)


ANON_KEY = _key("TEST_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
SERVICE_KEY = _key("TEST_SUPABASE_SERVICE_KEY", "PRIVATE_SUPABASE_SERVICE_KEY")


def supabase_env(name: str) -> str | None:
    """A value of supabase/.env, the file config.toml reads through env()."""
    return _env_file_value(REPO_ROOT / "supabase" / ".env", name)


def new_email(prefix: str = "u") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}@{EMAIL_DOMAIN}"


class GoTrue:
    """Anon-key client plus the admin calls the tests need for setup and cleanup."""

    def __init__(self, http: httpx.AsyncClient) -> None:
        self.http = http
        self.created: list[str] = []

    @property
    def anon(self) -> dict:
        return {"apikey": ANON_KEY}

    def bearer(self, token: str) -> dict:
        return {"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}

    async def signup(self, email: str, password: str = STRONG_PASSWORD, **extra) -> httpx.Response:
        response = await self.http.post(f"{GOTRUE_URL}/signup", headers=self.anon,
                                        json={"email": email, "password": password, **extra})
        if response.status_code == 200 and response.json().get("id"):
            self.created.append(response.json()["id"])
        return response

    async def create_confirmed(self, email: str, password: str = STRONG_PASSWORD) -> str:
        admin = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
        response = await self.http.post(f"{GOTRUE_URL}/admin/users", headers=admin,
                                        json={"email": email, "password": password, "email_confirm": True})
        assert response.status_code == 200, response.text
        self.created.append(response.json()["id"])
        return response.json()["id"]

    async def sign_in(self, email: str, password: str = STRONG_PASSWORD) -> httpx.Response:
        return await self.http.post(f"{GOTRUE_URL}/token", params={"grant_type": "password"},
                                    headers=self.anon, json={"email": email, "password": password})

    async def recover(self, email: str) -> httpx.Response:
        return await self.http.post(f"{GOTRUE_URL}/recover", headers=self.anon, json={"email": email})

    async def open_link(self, link: str) -> httpx.Response:
        """Follow an emailed verify link once, without following GoTrue's redirect."""
        return await self.http.get(link, follow_redirects=False)

    async def latest_link(self, email: str) -> str:
        """The newest verify link sent to `email`, read from the local mail catcher (Mailpit)."""
        found = await self.http.get(f"{MAILPIT_URL}/search", params={"query": f'to:"{email}"'})
        messages = found.json().get("messages") or []
        assert messages, f"no email for {email} in the mail catcher"
        message = await self.http.get(f"{MAILPIT_URL}/message/{messages[0]['ID']}")
        body = message.json()
        match = VERIFY_LINK.search(body.get("Text") or "") or VERIFY_LINK.search(body.get("HTML") or "")
        assert match, "no verify link in the email"
        return match.group(0).replace("&amp;", "&")

    async def delete_created(self) -> None:
        admin = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
        for user_id in self.created:
            await self.http.delete(f"{GOTRUE_URL}/admin/users/{user_id}", headers=admin)


@pytest.fixture
async def gotrue() -> AsyncGenerator[GoTrue, None]:
    if not (ANON_KEY and SERVICE_KEY):
        pytest.skip("Supabase anon/service keys not configured (frontend/.env.local)")
    async with httpx.AsyncClient(timeout=20) as http:
        try:
            await http.get(f"{GOTRUE_URL}/health", headers={"apikey": ANON_KEY})
        except httpx.HTTPError:
            pytest.skip("local Supabase Auth is not running")
        client = GoTrue(http)
        try:
            yield client
        finally:
            await client.delete_created()


@pytest.fixture
async def dev_db() -> AsyncGenerator[AsyncEngine, None]:
    engine = create_async_engine(DEV_DATABASE_URL, poolclass=NullPool, isolation_level="AUTOCOMMIT")
    try:
        yield engine
    finally:
        await engine.dispose()
