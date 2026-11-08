"""FastAPI dependency injection functions."""

from __future__ import annotations

import base64
import json
from typing import AsyncGenerator, Callable, Optional

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access_rights import AreaRight
from app.core.config import settings
from app.core.exceptions import (
    AppException,
    IdempotencyKeyRequiredError,
    InvalidTokenError,
    ResourceNotFoundError,
    RoleDeniedError,
)
from app.core.rate_limit import USER_KEY_STATE, enforce_user_limit, rate_limit_key
from app.core.security import extract_user_claims, verify_token
from app.db.session import get_session_manager
from app.schemas.auth import CurrentUser
from app.services.access_service import AccessService, BusinessContext
from app.services.entitlements import can_create_business
from app.services.mfa_service import MfaService
from app.services.user_role_service import UserRoleService
from app.services.user_service import UserService

IDEMPOTENCY_KEY_MAX = 255

SUPER_ADMIN_ROLE = "super_admin"
# Reachable while app_metadata.must_change_password is set (D-30); the change itself is Next.js.
PASSWORD_CHANGE_EXEMPT_PATHS = frozenset({"/api/v1/auth/me", "/api/v1/profile"})

# HTTP Bearer token security scheme (auto_error=False for fallback to cookies)
security = HTTPBearer(auto_error=False)


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


async def get_verified_claims(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[dict]:
    """Verified JWT claims of the caller, or None when the request carries no token.

    Token from the Authorization header first, then the Supabase SSR cookies. A token
    that is present is always verified (never blindly decoded); an invalid one is a 401.
    FastAPI caches this per request, so get_current_user and get_db share one check.
    """
    token = credentials.credentials if credentials else None
    if not token:
        token = extract_token_from_cookies(request)
    if not token:
        return None
    claims = extract_user_claims(await verify_token(token))
    setattr(request.state, USER_KEY_STATE, claims.get("user_id"))
    return claims


async def enforce_rate_limit(
    request: Request, _claims: Optional[dict] = Depends(get_verified_claims)
) -> None:
    """Router-wide per-user limit (CS-16, AC-25): reads vs mutations, values from settings."""
    if request.method == "GET":
        enforce_user_limit("read", rate_limit_key(request), settings.LIST_RATE_LIMIT)
    else:
        enforce_user_limit("mutation", rate_limit_key(request), settings.MUTATION_RATE_LIMIT)


async def get_db(
    claims: Optional[dict] = Depends(get_verified_claims),
) -> AsyncGenerator[AsyncSession, None]:
    """Session whose transactions carry the verified caller as app.user_id (RLS, B0.4)."""
    user_id = claims.get("user_id") if claims else None
    async with get_session_manager().session(user_id) as session:
        yield session


async def get_current_user(
    request: Request,
    claims: Optional[dict] = Depends(get_verified_claims),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """The authenticated caller; 401 without a valid token or for a banned/deleted account.

    The account state is read live once per request (FastAPI caches this dependency).
    """
    return await _authenticated_user(request, claims, db, allow_pending_mfa=False)


async def get_current_user_pending_mfa(
    request: Request,
    claims: Optional[dict] = Depends(get_verified_claims),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """Like get_current_user, but an AAL1 session of a user with a verified factor is accepted.

    Only for the 2FA recovery-code route (D-23): that user cannot reach AAL2 by definition.
    """
    return await _authenticated_user(request, claims, db, allow_pending_mfa=True)


async def _authenticated_user(
    request: Request, claims: Optional[dict], db: AsyncSession, allow_pending_mfa: bool
) -> CurrentUser:
    if claims is None:
        raise InvalidTokenError("Missing authentication token (header or Supabase SSR cookie)")
    user = CurrentUser(**claims)
    await UserService(db).assert_account_usable(user.aal, allow_pending_mfa)
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
    await MfaService(db).assert_super_admin_session(current_user)
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
            business_id, current_user.user_id, area_key, right, include_deleted,
            aal=current_user.aal,
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
        await service.resolve(business_id, current_user.user_id, None, None, aal=current_user.aal)
        area_key = await service.area_for_tab(tab_key)
        if area_key is None:
            raise ResourceNotFoundError("Tab", tab_key)
        return await service.resolve(
            business_id, current_user.user_id, area_key, right, aal=current_user.aal
        )

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


async def require_idempotency_key(
    idempotency_key: Optional[str] = Header(
        None, alias="Idempotency-Key", max_length=IDEMPOTENCY_KEY_MAX
    ),
) -> str:
    """Create/post routes need a client-generated key per submit (AC-19); missing -> 400."""
    if not idempotency_key or not idempotency_key.strip():
        raise IdempotencyKeyRequiredError()
    return idempotency_key.strip()
