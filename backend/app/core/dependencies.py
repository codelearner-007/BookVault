"""FastAPI dependency injection functions."""

from __future__ import annotations

import base64
import json
from typing import AsyncGenerator, Callable, Optional

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.exceptions import (
    AppException,
    InvalidTokenError,
    ResourceNotFoundError,
    RoleDeniedError,
)
from app.core.security import extract_user_claims, verify_token
from app.db.session import get_session_manager
from app.schemas.auth import CurrentUser
from app.services.access_service import AccessService, BusinessContext
from app.services.entitlements import can_create_business
from app.services.user_role_service import UserRoleService

SUPER_ADMIN_ROLE = "super_admin"
# Reachable while app_metadata.must_change_password is set (D-30); the change itself is Next.js.
PASSWORD_CHANGE_EXEMPT_PATHS = frozenset({"/api/v1/auth/me", "/api/v1/profile"})

# HTTP Bearer token security scheme (auto_error=False for fallback to cookies)
security = HTTPBearer(auto_error=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Provide database session for dependency injection.

    Yields:
        AsyncSession instance

    Example:
        @router.get("/users")
        async def get_users(db: AsyncSession = Depends(get_db)):
            ...
    """
    session_manager = get_session_manager()
    async with session_manager.session() as session:
        yield session


def _reassemble_cookie_value(cookies: dict[str, str], base_name: str) -> Optional[str]:
    """
    Reassemble possibly-chunked cookie values.

    Supabase SSR may chunk large cookies into `name.0`, `name.1`, ...
    """
    if base_name in cookies:
        return cookies[base_name]

    chunks: list[str] = []
    i = 0
    while f"{base_name}.{i}" in cookies:
        chunks.append(cookies[f"{base_name}.{i}"])
        i += 1

    return "".join(chunks) if chunks else None


def _find_supabase_auth_cookie_base_name(cookies: dict[str, str]) -> Optional[str]:
    """
    Find the base cookie name used by @supabase/ssr for session storage.

    Common patterns include:
    - sb-<project-ref>-auth-token
    - sb-<project-ref>-auth-token.0 / .1 / ...
    """
    for name in cookies.keys():
        base = name.split(".", 1)[0]
        if base.startswith("sb-") and base.endswith("-auth-token"):
            return base
    return None


def _maybe_extract_access_token(value: str) -> Optional[str]:
    """
    Extract access_token from known Supabase SSR cookie payload formats.
    """
    raw = value.strip()

    # If it already looks like a JWT, return it directly.
    if raw.count(".") == 2 and raw.startswith("eyJ"):
        return raw

    # Format: "base64-<base64(json)>"
    if raw.startswith("base64-"):
        raw = raw[len("base64-") :]
        # Fix missing padding if present
        padding = "=" * (-len(raw) % 4)
        try:
            decoded = base64.b64decode(raw + padding).decode("utf-8")
            raw = decoded.strip()
        except Exception:
            return None

    # Try JSON parse
    try:
        data = json.loads(raw)
    except Exception:
        return None

    if isinstance(data, dict):
        token = data.get("access_token") or data.get("accessToken")
        if isinstance(token, str) and token:
            return token
        # Some shapes may nest the session
        session = data.get("session") or data.get("currentSession")
        if isinstance(session, dict):
            token = session.get("access_token") or session.get("accessToken")
            if isinstance(token, str) and token:
                return token
        return None

    # Unknown/unsupported format
    return None


def extract_token_from_cookies(request: Request) -> Optional[str]:
    """
    Extract JWT token from Supabase SSR cookies.

    Supports:
    - Direct access token cookie (legacy): sb-access-token(.0/.1/...)
    - Supabase SSR auth cookie: sb-<project-ref>-auth-token(.0/.1/...) containing session JSON

    Args:
        request: FastAPI request object

    Returns:
        JWT access token or None
    """
    cookies = request.cookies

    # 1) Legacy / custom direct token cookie
    direct = _reassemble_cookie_value(cookies, "sb-access-token")
    if direct:
        return direct

    # 2) Supabase SSR auth-token cookie (contains a session payload, not a raw JWT)
    base = _find_supabase_auth_cookie_base_name(cookies)
    if not base:
        return None

    payload = _reassemble_cookie_value(cookies, base)
    if not payload:
        return None

    return _maybe_extract_access_token(payload)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> CurrentUser:
    """
    Extract and validate current user from JWT token.

    Supports token from:
    1. Authorization: Bearer <token> header (if present)
    2. Supabase SSR cookies (fallback for Next.js/Vercel rewrite flows)

    Args:
        request: FastAPI request object
        credentials: HTTP Authorization header with Bearer token (optional)

    Returns:
        CurrentUser instance with user_id, email, role, permissions

    Raises:
        HTTPException: 401 if token is invalid or expired

    Example:
        @router.get("/profile")
        async def get_profile(current_user: CurrentUser = Depends(get_current_user)):
            print(current_user.user_id, current_user.permissions)
    """
    # Priority 1: Authorization header
    token = credentials.credentials if credentials else None

    # Priority 2: Supabase SSR cookies (for Next.js/Vercel rewrite flows)
    if not token:
        token = extract_token_from_cookies(request)

    if not token:
        raise InvalidTokenError("Missing authentication token (header or Supabase SSR cookie)")

    # Always verify JWT, never blindly decode
    payload = await verify_token(token)
    claims = extract_user_claims(payload)
    user = CurrentUser(**claims)
    if user.must_change_password and request.url.path not in PASSWORD_CHANGE_EXEMPT_PATHS:
        raise AppException(
            "You must change your password before continuing",
            status_code=403,
            details={"code": "password_change_required"},
        )
    return user


def require_role(*allowed_roles: str) -> Callable:
    """
    Factory function to create role guard dependency.

    Args:
        *allowed_roles: Role names that are allowed (e.g., "admin", "super_admin")

    Returns:
        Dependency function that checks role

    Raises:
        HTTPException: 403 if user lacks required role

    Example:
        @router.get("/stats", dependencies=[Depends(require_role("admin", "super_admin"))])
    """
    async def role_checker(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if current_user.user_role not in allowed_roles:
            raise RoleDeniedError(", ".join(allowed_roles))
        return current_user

    return role_checker


async def require_live_super_admin(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """Platform-route guard: the caller must hold super_admin in user_roles right now.

    The JWT claim is not trusted here (it can be stale for the token lifetime, CS-03/CS-26).
    """
    if not await UserRoleService(db).is_super_admin(current_user.user_id):
        raise RoleDeniedError(SUPER_ADMIN_ROLE)
    return current_user


# Every (area, right) pair a route declares; validated against the DB seed at startup.
REGISTERED_ACCESS_PAIRS: set[tuple[str, str]] = set()


def _business_access(
    area_key: str | None, right: AreaRight | None, include_deleted: bool = False
) -> Callable:
    async def business_access(
        business_id: str,
        current_user: CurrentUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> BusinessContext:
        return await AccessService(db).resolve(
            business_id, current_user.user_id, area_key, right, include_deleted
        )

    business_access.grants_business_access = True  # read by the route-inventory test
    business_access.access_pair = (area_key, right.value) if right else None
    return business_access


def require_business_access(
    area_key: str, right: AreaRight, include_deleted: bool = False
) -> Callable:
    """Guard for a /businesses/{business_id} route: active membership + exactly `right` on `area_key`.

    Not a member / unknown / soft-deleted business -> 404 (same body); right not held -> 403.
    """
    if not isinstance(right, AreaRight):
        raise TypeError(f"right must be an AreaRight, got {right!r}")
    REGISTERED_ACCESS_PAIRS.add((area_key, right.value))
    return _business_access(area_key, right, include_deleted)


def require_business_member() -> Callable:
    """Guard for business routes that need membership only (no area), e.g. GET /businesses/{id}."""
    return _business_access(None, None)


def require_tab_area_access(right: AreaRight) -> Callable:
    """Guard for /businesses/{business_id}/.../{tab_key}: `right` on the area that tab opens."""

    async def tab_area_access(
        business_id: str,
        tab_key: str,
        current_user: CurrentUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> BusinessContext:
        service = AccessService(db)
        await service.resolve(business_id, current_user.user_id, None, None)
        area_key = await service.area_for_tab(tab_key)
        if area_key is None:
            raise ResourceNotFoundError("Tab", tab_key)
        return await service.resolve(business_id, current_user.user_id, area_key, right)

    tab_area_access.grants_business_access = True
    return tab_area_access


async def require_business_creator(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    decision = await can_create_business(db, current_user)
    if not decision.allowed:
        raise AppException(decision.reason, status_code=403)
    return current_user
