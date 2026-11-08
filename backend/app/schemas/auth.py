"""Authentication and authorization schemas."""

from pydantic import BaseModel, EmailStr, Field


class UserClaims(BaseModel):
    """JWT claims extracted from Supabase token."""

    user_id: str = Field(..., description="User UUID from auth.users")
    email: EmailStr = Field(..., description="User email address")
    user_role: str = Field(default="admin", description="User's assigned role name")
    hierarchy_level: int = Field(default=100, description="Role hierarchy level")


class CurrentUser(BaseModel):
    """Current authenticated user."""

    user_id: str
    email: EmailStr
    user_role: str
    hierarchy_level: int
    aal: str | None = None
    must_change_password: bool = False

    def has_role(self, role: str) -> bool:
        return self.user_role == role



