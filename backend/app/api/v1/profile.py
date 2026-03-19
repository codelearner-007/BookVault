"""Profile endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.schemas.auth import CurrentUser
from app.schemas.request.profile import UpdateProfileRequest
from app.schemas.response.profile import ProfileResponse
from app.services.profile_service import ProfileService

router = APIRouter(prefix="/profile", tags=["Profile"])


@router.get("", response_model=ProfileResponse)
async def get_profile(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ProfileResponse:
    """Get the current user's profile. Auto-creates a profile if one does not exist."""
    service = ProfileService(db)
    profile = await service.get_or_create_profile(current_user.user_id)
    return ProfileResponse.model_validate(profile)


@router.patch("", response_model=ProfileResponse)
async def update_profile(
    data: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> ProfileResponse:
    """Update the current user's profile."""
    service = ProfileService(db)
    profile = await service.update_profile(current_user.user_id, data)
    return ProfileResponse.model_validate(profile)
