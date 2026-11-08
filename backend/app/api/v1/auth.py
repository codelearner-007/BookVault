"""Authentication endpoints (sign-in itself runs in Next.js against Supabase Auth)."""

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_current_user_pending_mfa, get_db
from app.core.rate_limit import limiter
from app.schemas.auth import CurrentUser
from app.schemas.request.auth import RecordAuthEventRequest, UseRecoveryCodeRequest
from app.schemas.response.auth import (
    CurrentUserResponse,
    RecoveryCodesResponse,
    RecoveryCodesStatusResponse,
)
from app.services.auth_audit_service import AuthAuditService
from app.services.mfa_service import MfaService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/me", response_model=CurrentUserResponse)
@limiter.limit("60/minute")
async def get_current_user_info(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUserResponse:
    """
    Get current authenticated user information including JWT claims.

    Requires: Valid JWT token in Authorization header or Supabase SSR cookie.
    """
    return CurrentUserResponse(
        user_id=current_user.user_id,
        email=current_user.email,
        user_role=current_user.user_role,
        hierarchy_level=current_user.hierarchy_level,
        must_change_password=current_user.must_change_password,
    )


@router.post(
    "/mfa/recovery-codes",
    response_model=RecoveryCodesResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_recovery_codes(
    db: AsyncSession = Depends(get_db, scope="function"),
    current_user: CurrentUser = Depends(get_current_user),
) -> RecoveryCodesResponse:
    """New recovery codes (the old set is replaced). AAL2 and a recent sign-in required."""
    return RecoveryCodesResponse(codes=await MfaService(db).generate_codes(current_user))


@router.get("/mfa/recovery-codes", response_model=RecoveryCodesStatusResponse)
async def recovery_codes_status(
    db: AsyncSession = Depends(get_db, scope="function"),
    current_user: CurrentUser = Depends(get_current_user),
) -> RecoveryCodesStatusResponse:
    return RecoveryCodesStatusResponse(remaining=await MfaService(db).remaining_codes(current_user))


@router.delete("/mfa/recovery-codes", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recovery_codes(
    db: AsyncSession = Depends(get_db, scope="function"),
    current_user: CurrentUser = Depends(get_current_user),
) -> Response:
    """Called after 2FA is turned off; refused while a verified factor remains."""
    await MfaService(db).delete_codes(current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/mfa/recover", status_code=status.HTTP_204_NO_CONTENT)
async def use_recovery_code(
    body: UseRecoveryCodeRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
    current_user: CurrentUser = Depends(get_current_user_pending_mfa),
) -> Response:
    """Spend a recovery code from the AAL1 session; Next.js then removes the TOTP factors."""
    await MfaService(db).use_code(current_user, body.code)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/events", status_code=status.HTTP_204_NO_CONTENT)
async def record_auth_event(
    body: RecordAuthEventRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
    current_user: CurrentUser = Depends(get_current_user),
) -> Response:
    """Audit an auth event only Next.js sees (allow-listed, about the caller only)."""
    await AuthAuditService(db).record_client_event(current_user, body.event)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
