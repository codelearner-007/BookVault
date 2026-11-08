"""Pytest harness (build-plan B0.1).

Test modes, chosen per test with a marker:
  R (default)            one connection per test: BEGIN -> test -> ROLLBACK. The app's
                         sessions join that transaction through SAVEPOINTs.
  C (@pytest.mark.committed)  real commits; every row the test creates is removed by the
                         `committed` fixture's finalizer.
  T (@pytest.mark.reset) rebuilds the test database from supabase/migrations.

The test database is `bookvault_test` (see tests/support/test_db.py), never the
development database. It is rebuilt once per session unless TEST_DB_REUSE=1.
"""

from __future__ import annotations

import os

# Settings are read when app.* is imported, so the test environment is set first.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:55342/bookvault_test"
)
TEST_JWT_SECRET = os.environ.get("TEST_JWT_SECRET", "bookvault-test-only-secret-32-chars-minimum")
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["JWT_SECRET"] = TEST_JWT_SECRET
os.environ["USE_JWKS"] = "false"
os.environ["ENVIRONMENT"] = "test"

from collections.abc import AsyncGenerator  # noqa: E402

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi import Depends  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.core.dependencies import get_db, get_verified_claims  # noqa: E402
from app.db.session import DB_ROLE_KEY, bind_request_user  # noqa: E402
from app.main import app  # noqa: E402
from tests.support.factories import UserFactory  # noqa: E402
from tests.support.test_db import build_test_database  # noqa: E402

API_DB_ROLE = "bookvault_api"
ASYNC_TEST_DATABASE_URL = TEST_DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "committed: test mode C (real commits + cleanup)")
    config.addinivalue_line("markers", "reset: test mode T (rebuilds the test database)")


@pytest.fixture(scope="session", autouse=True)
def test_database() -> None:
    """Build the test database once per session from the migrations."""
    if os.environ.get("TEST_DB_REUSE") != "1":
        build_test_database()


def _engine():
    return create_async_engine(ASYNC_TEST_DATABASE_URL, poolclass=NullPool)


@pytest.fixture
async def db_conn() -> AsyncGenerator[AsyncConnection, None]:
    """Mode R: one connection in an outer transaction that is always rolled back."""
    engine = _engine()
    async with engine.connect() as conn:
        transaction = await conn.begin()
        try:
            yield conn
        finally:
            await transaction.rollback()
    await engine.dispose()


@pytest.fixture
async def client(db_conn: AsyncConnection) -> AsyncGenerator[httpx.AsyncClient, None]:
    """HTTP client whose requests run inside the test's rolled-back transaction."""

    async def _get_test_db(
        claims: dict | None = Depends(get_verified_claims),
    ) -> AsyncGenerator[AsyncSession, None]:
        """Like get_db, but as the API role on the test connection (RLS applies, B0.4)."""
        async with AsyncSession(
            bind=db_conn, join_transaction_mode="create_savepoint", expire_on_commit=False
        ) as session:
            session.sync_session.info[DB_ROLE_KEY] = API_DB_ROLE
            bind_request_user(session, claims.get("user_id") if claims else None)
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                # A released savepoint keeps SET LOCAL; give the test its postgres session back.
                await db_conn.execute(text("RESET ROLE"))
                await db_conn.execute(text("SELECT set_config('app.user_id', '', true)"))

    app.dependency_overrides[get_db] = _get_test_db
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
            yield http
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def users(db_conn: AsyncConnection) -> UserFactory:
    """Create auth users (with live platform roles) inside the test transaction."""
    return UserFactory(db_conn, TEST_JWT_SECRET)


@pytest.fixture
async def committed() -> AsyncGenerator[UserFactory, None]:
    """Mode C: autocommit connection; every user it created (and their businesses) is purged."""
    engine = _engine()
    async with engine.connect() as conn:
        conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
        factory = UserFactory(conn, TEST_JWT_SECRET)
        try:
            yield factory
        finally:
            await factory.purge_created()
    await engine.dispose()
