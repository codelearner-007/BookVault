"""Rate limiting configuration using slowapi."""

from limits import parse
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.exceptions import AppException

limiter = Limiter(key_func=get_remote_address)


class RateLimitedError(AppException):
    def __init__(self) -> None:
        super().__init__(message="Too many requests, try again later", status_code=429)


def enforce_user_limit(scope: str, user_id: str, limit: str) -> None:
    """Count one hit for (scope, user) against `limit` (e.g. "10/hour"); 429 when exceeded."""
    if not limiter.limiter.hit(parse(limit), scope, user_id):
        raise RateLimitedError()
