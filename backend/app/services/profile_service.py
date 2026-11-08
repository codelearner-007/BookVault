"""Profile service with business logic."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.models.user_profile import UserProfile
from app.repositories.country_repository import CountryRepository
from app.repositories.profile_repository import ProfileRepository
from app.schemas.request.profile import UpdateProfileRequest


class ProfileService:
    """Service for user profile management."""

    def __init__(self, session: AsyncSession):
        self.repository = ProfileRepository(session)
        self.countries = CountryRepository(session)

    async def get_profile(self, user_id: str) -> Optional[UserProfile]:
        """
        Get user profile by user_id.

        Args:
            user_id: Auth user UUID

        Returns:
            UserProfile instance or None if not exists
        """
        return await self.repository.get_by_user_id(user_id)

    async def get_or_create_profile(self, user_id: str) -> UserProfile:
        """
        Get existing profile or create an empty one.

        Args:
            user_id: Auth user UUID

        Returns:
            UserProfile instance
        """
        profile = await self.repository.get_by_user_id(user_id)
        if profile:
            return profile
        return await self.repository.create_profile(user_id=user_id)

    async def update_profile(self, user_id: str, data: UpdateProfileRequest) -> UserProfile:
        """
        Update user profile, creating one if it doesn't exist.

        Args:
            user_id: Auth user UUID
            data: Profile update data

        Returns:
            Updated UserProfile instance
        """
        profile = await self.get_or_create_profile(user_id)
        update_data = data.model_dump(exclude_unset=True)
        if update_data.pop("dismiss_country_prompt", None):
            update_data["country_prompt_dismissed_at"] = datetime.now(timezone.utc)
        country_id = update_data.get("country_id")
        if country_id is not None and not await self.countries.exists(country_id):
            raise ValidationError("Unknown country", field="country_id")
        if not update_data:
            return profile
        return await self.repository.update_profile(profile, **update_data)
