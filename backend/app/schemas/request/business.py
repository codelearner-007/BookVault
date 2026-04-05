"""Business request schemas for input validation."""

from pydantic import BaseModel, Field


class CreateBusinessRequest(BaseModel):
    """Request body for creating a new business."""

    name: str = Field(..., min_length=1, description="Business name")
    country: str | None = Field(None, description="Country where the business operates")
