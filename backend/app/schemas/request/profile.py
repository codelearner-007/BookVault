"""Profile request schemas."""

from typing import Optional

from pydantic import Field

from app.schemas.common import URL_MAX, RequestModel


class UpdateProfileRequest(RequestModel):
    """Partial update of the caller's profile."""

    full_name: Optional[str] = Field(default=None, max_length=255)
    avatar_url: Optional[str] = Field(default=None, max_length=URL_MAX)
    department: Optional[str] = Field(default=None, max_length=100)
