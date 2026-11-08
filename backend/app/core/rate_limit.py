"""Rate limiting with slowapi, keyed by user id (fallback: client IP), B0.5 / CS-16 / AC-25."""

from fastapi import Request
from limits import parse
from slowapi import Limiter

from app.core.config import settings
from app.core.exceptions import AppException

USER_KEY_STATE = "rate_limit_user_id"


def client_ip(request: Request) -> str:
    """Client address; the first X-Forwarded-For hop only behind a trusted proxy."""
    if settings.TRUST_FORWARDED_FOR:
        forwarded = request.headers.get("x-forwarded-for", "")
        first_hop = forwarded.split(",")[0].strip()
        if first_hop:
            return first_hop
    return request.client.host if request.client else "unknown"


def rate_limit_key(request: Request) -> str:
    user_id = getattr(request.state, USER_KEY_STATE, None)
    return f"user:{user_id}" if user_id else f"ip:{client_ip(request)}"


limiter = Limiter(key_func=rate_limit_key)


class RateLimitedError(AppException):
    def __init__(self) -> None:
        super().__init__(message="Too many requests, try again later", status_code=429)


def enforce_user_limit(scope: str, user_id: str, limit: str) -> None:
    """Count one hit for (scope, user) against `limit` (e.g. "10/hour"); 429 when exceeded."""
    if not limiter.limiter.hit(parse(limit), scope, user_id):
        raise RateLimitedError()
