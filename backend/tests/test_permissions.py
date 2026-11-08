"""Role guards and token extraction (NA-14: replaces the removed require_permission tests)."""

from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from app.core.dependencies import require_role
from app.core.exceptions import RoleDeniedError
from app.schemas.auth import CurrentUser


def _user(role: str) -> CurrentUser:
    return CurrentUser(
        user_id="0190f1d2-1111-7aaa-8bbb-0123456789ab",
        email="guard@bookvault-test.dev",
        user_role=role,
        hierarchy_level=100,
    )


async def test_role_guard_blocks_missing_token(client: AsyncClient):
    response = await client.get("/api/v1/roles")
    assert response.status_code == 401
    assert "authentication token" in response.json()["error"].lower()


async def test_role_guard_rejects_other_role():
    with pytest.raises(RoleDeniedError) as exc_info:
        await require_role("super_admin")(_user("admin"))
    assert exc_info.value.status_code == 403


async def test_role_guard_allows_listed_role():
    user = _user("admin")
    assert await require_role("admin", "super_admin")(user) == user


@pytest.mark.anyio
async def test_cookie_token_extraction():
    """Test extracting JWT from cookies."""
    from app.core.dependencies import extract_token_from_cookies
    from fastapi import Request

    # Mock request with standard cookie
    mock_request = AsyncMock(spec=Request)
    mock_request.cookies = {"sb-access-token": "test-token-123"}

    token = extract_token_from_cookies(mock_request)
    assert token == "test-token-123"


@pytest.mark.anyio
async def test_chunked_cookie_extraction():
    """Test extracting JWT from chunked cookies."""
    from app.core.dependencies import extract_token_from_cookies
    from fastapi import Request

    # Mock request with chunked cookies
    mock_request = AsyncMock(spec=Request)
    mock_request.cookies = {
        "sb-access-token.0": "chunk1",
        "sb-access-token.1": "chunk2",
        "sb-access-token.2": "chunk3",
    }

    token = extract_token_from_cookies(mock_request)
    assert token == "chunk1chunk2chunk3"


@pytest.mark.anyio
async def test_supabase_ssr_auth_cookie_extraction_base64_json():
    """Test extracting JWT from a Supabase SSR auth-token cookie payload."""
    import base64
    import json

    from app.core.dependencies import extract_token_from_cookies
    from fastapi import Request

    session_payload = {"access_token": "jwt-access-token-xyz", "refresh_token": "rt"}
    encoded = base64.b64encode(json.dumps(session_payload).encode("utf-8")).decode("utf-8")

    mock_request = AsyncMock(spec=Request)
    mock_request.cookies = {"sb-test-auth-token": f"base64-{encoded}"}

    token = extract_token_from_cookies(mock_request)
    assert token == "jwt-access-token-xyz"


@pytest.mark.anyio
async def test_supabase_ssr_auth_cookie_extraction_chunked():
    """Test extracting JWT from chunked Supabase SSR auth-token cookies."""
    import base64
    import json

    from app.core.dependencies import extract_token_from_cookies
    from fastapi import Request

    session_payload = {"access_token": "jwt-access-token-abc"}
    encoded = base64.b64encode(json.dumps(session_payload).encode("utf-8")).decode("utf-8")
    value = f"base64-{encoded}"

    mock_request = AsyncMock(spec=Request)
    mock_request.cookies = {
        "sb-anything-auth-token.0": value[:10],
        "sb-anything-auth-token.1": value[10:],
    }

    token = extract_token_from_cookies(mock_request)
    assert token == "jwt-access-token-abc"


@pytest.mark.anyio
async def test_cookie_extraction_returns_none_when_missing():
    """Test that cookie extraction returns None when cookies are missing."""
    from app.core.dependencies import extract_token_from_cookies
    from fastapi import Request

    # Mock request without cookies
    mock_request = AsyncMock(spec=Request)
    mock_request.cookies = {}

    token = extract_token_from_cookies(mock_request)
    assert token is None
