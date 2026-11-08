"""Per-request id and the FastAPI CSRF check (B0.5, CS-15, CS-29, AC-28, AC-31)."""

import logging
import uuid
from contextvars import ContextVar

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from app.core.config import settings

REQUEST_ID_HEADER = "X-Request-ID"
MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
API_PREFIX = "/api/"

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
logger = logging.getLogger(__name__)


def current_request_id() -> str | None:
    return request_id_var.get()


def _csrf_allowed(request: Request) -> bool:
    if request.method not in MUTATING_METHODS or not request.url.path.startswith(API_PREFIX):
        return True
    if request.headers.get(settings.CSRF_HEADER):
        return True
    origin = request.headers.get("origin")
    return origin is not None and origin in settings.ALLOWED_ORIGINS


def _error(status_code: int, message: str, request_id: str, details: dict | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": message, "status_code": status_code, "details": details or {},
                 "request_id": request_id},
    )


async def request_context_middleware(request: Request, call_next: RequestResponseEndpoint) -> Response:
    """Assign a request id (never taken from the client), reject cross-site mutations and
    turn unhandled errors into a generic 500 that carries the id (details stay in the log)."""
    request_id = uuid.uuid4().hex
    token = request_id_var.set(request_id)
    try:
        if not _csrf_allowed(request):
            response: Response = _error(403, "Cross-site request rejected", request_id,
                                        {"code": "csrf_rejected"})
        else:
            try:
                response = await call_next(request)
            except Exception:
                logger.exception("Unhandled error (request %s)", request_id)
                response = _error(500, "Internal server error", request_id)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
    finally:
        request_id_var.reset(token)
