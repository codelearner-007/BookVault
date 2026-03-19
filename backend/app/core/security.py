"""JWT validation and security utilities."""

import logging
import time
from typing import Any, Dict, Optional

import httpx
from jose import JWTError, jwt

from app.core.config import settings
from app.core.exceptions import InvalidTokenError

logger = logging.getLogger(__name__)

# Cache for JWKS keys with TTL
_jwks_cache: Dict[str, Any] = {}
_jwks_cache_timestamp: Optional[float] = None
_jwks_cache_ttl: int = 3600  # 1 hour TTL for JWKS cache


async def fetch_jwks() -> Dict[str, Any]:
    """
    Fetch JWKS (JSON Web Key Set) from Supabase with caching and TTL.

    Returns:
        JWKS dictionary containing public keys for JWT verification

    Raises:
        InvalidTokenError: If JWKS cannot be fetched
    """
    global _jwks_cache, _jwks_cache_timestamp

    # Check if cache is valid (not expired)
    if _jwks_cache and _jwks_cache_timestamp:
        if time.time() - _jwks_cache_timestamp < _jwks_cache_ttl:
            return _jwks_cache

    jwks_url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:  # 10 second timeout
            response = await client.get(jwks_url)
            response.raise_for_status()
            _jwks_cache = response.json()
            _jwks_cache_timestamp = time.time()
            return _jwks_cache
    except httpx.TimeoutException:
        raise InvalidTokenError("JWKS fetch timeout (10s)")
    except Exception as e:
        raise InvalidTokenError(f"Failed to fetch JWKS: {str(e)}")


def verify_token_hs256(token: str) -> Dict[str, Any]:
    """
    Verify JWT token using HS256 algorithm (legacy support).

    Args:
        token: JWT token string

    Returns:
        Decoded JWT payload

    Raises:
        InvalidTokenError: If token is invalid or expired
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            audience=settings.JWT_AUDIENCE,
        )
        return payload
    except JWTError as e:
        raise InvalidTokenError(f"HS256 validation failed: {str(e)}")


async def verify_token_jwks(token: str) -> Dict[str, Any]:
    """
    Verify JWT token using JWKS (supports ES256, RS256).

    Args:
        token: JWT token string

    Returns:
        Decoded JWT payload

    Raises:
        InvalidTokenError: If token is invalid or expired
    """
    try:
        # Get unverified header to extract kid
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        if not kid:
            raise InvalidTokenError("No 'kid' found in token header")

        # Fetch JWKS and find matching key
        jwks_data = await fetch_jwks()
        signing_key = next(
            (key for key in jwks_data.get("keys", []) if key.get("kid") == kid),
            None,
        )

        if not signing_key:
            raise InvalidTokenError(f"No matching key found for kid: {kid}")

        # Verify token with public key
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["ES256", "RS256"],
            audience=settings.JWT_AUDIENCE,
        )
        return payload

    except JWTError as e:
        raise InvalidTokenError(f"JWKS validation failed: {str(e)}")


async def verify_token(token: str) -> Dict[str, Any]:
    """
    Verify JWT token using the configured method.

    When USE_JWKS is True, verifies with JWKS only (no silent fallback).
    When USE_JWKS is False, verifies with HS256.

    Args:
        token: JWT token string

    Returns:
        Decoded JWT payload

    Raises:
        InvalidTokenError: If token is invalid or expired
    """
    if settings.USE_JWKS:
        return await verify_token_jwks(token)
    return verify_token_hs256(token)


def extract_user_claims(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract user claims from JWT payload.

    Args:
        payload: Decoded JWT payload

    Returns:
        Dictionary containing user_id, email, role, hierarchy_level, permissions
    """
    return {
        "user_id": payload.get("sub"),
        "email": payload.get("email"),
        "user_role": payload.get("user_role", "user"),
        "hierarchy_level": payload.get("hierarchy_level", 100),
        "permissions": payload.get("permissions", []),
    }
