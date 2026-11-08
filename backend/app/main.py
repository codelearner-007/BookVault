"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import AppException, VersionConflictError
from app.core.logging_config import setup_logging
from app.core.rate_limit import limiter
from app.core.request_context import current_request_id, request_context_middleware
from app.db.session import get_session_manager
from app.services.startup_service import run_startup_checks

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan events.

    Handles startup and shutdown events for the FastAPI application.
    """
    # Startup
    logger.info("Starting FastAPI application...")
    async with get_session_manager().session() as session:
        await run_startup_checks(session)
    yield

    # Shutdown
    logger.info("Shutting down FastAPI application...")
    session_manager = get_session_manager()
    await session_manager.close()
    logger.info("Database connections closed")


# Create FastAPI app (OpenAPI docs only in development, AC-27)
app = FastAPI(
    title="BookVault API",
    version="1.0.0",
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter

# Request id + CSRF check on every request (AC-28, AC-31)
app.middleware("http")(request_context_middleware)

# CORS middleware (optional, disabled by default for Vercel rewrites)
if settings.ENABLE_CORS:
    logger.info("CORS enabled for origins: %s", settings.ALLOWED_ORIGINS)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

PG_UNIQUE_VIOLATION = "23505"
PG_FOREIGN_KEY_VIOLATION = "23503"
PG_CHECK_VIOLATION = "23514"


def _error(status_code: int, message: str, details: dict | None = None) -> JSONResponse:
    """ErrorResponse body; internals stay in the server log under the request id (CS-15)."""
    return JSONResponse(
        status_code=status_code,
        content={
            "error": message,
            "status_code": status_code,
            "details": details or {},
            "request_id": current_request_id(),
        },
    )


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    logger.info("AppException %s: %s", exc.status_code, exc.message)
    return _error(exc.status_code, exc.message, exc.details)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    return _error(exc.status_code, message)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return _error(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests, try again later")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """422 with field locations and messages only (input values are not echoed)."""
    errors = [{"loc": list(e.get("loc", [])), "msg": e.get("msg"), "type": e.get("type")}
              for e in exc.errors()]
    return _error(status.HTTP_422_UNPROCESSABLE_ENTITY, "Validation failed", {"errors": errors})


@app.exception_handler(StaleDataError)
async def stale_data_handler(request: Request, exc: StaleDataError) -> JSONResponse:
    conflict = VersionConflictError()
    return _error(conflict.status_code, conflict.message, conflict.details)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    code = getattr(getattr(exc, "orig", None), "sqlstate", None)
    logger.warning("IntegrityError %s", code)
    if code == PG_UNIQUE_VIOLATION:
        return _error(status.HTTP_409_CONFLICT, "A record with these values already exists",
                      {"code": "duplicate"})
    if code in (PG_FOREIGN_KEY_VIOLATION, PG_CHECK_VIOLATION):
        return _error(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid reference or value")
    return _error(status.HTTP_500_INTERNAL_SERVER_ERROR, "Internal server error")


# Health check endpoint
@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    """
    Health check endpoint.

    Returns:
        Health status with database connectivity check
    """
    # Check database connection
    try:
        session_manager = get_session_manager()
        async with session_manager.session() as session:
            await session.execute(text("SELECT 1"))
        database_status = "connected"
    except Exception as e:
        logger.error("Database health check failed: %s", e)
        database_status = "disconnected"

    return {
        "status": "healthy" if database_status == "connected" else "unhealthy",
        "database": database_status,
        "environment": settings.ENVIRONMENT,
    }


# Include API routers
app.include_router(api_router, prefix="/api")


# Root endpoint
@app.get("/", tags=["Root"])
async def root() -> dict:
    """Root endpoint with API information."""
    return {
        "message": "BookVault API",
        "version": "1.0.0",
        "health": "/health",
    }
