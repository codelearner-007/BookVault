"""Customer request schemas for input validation."""

from pydantic import BaseModel, Field


class CustomerCreate(BaseModel):
    """Request body for creating a new customer."""

    name: str = Field(..., min_length=1)
    code: str | None = None
    billing_address: str | None = None
    delivery_address: str | None = None
    email: str | None = None


class CustomerUpdate(BaseModel):
    """Request body for updating a customer's fields."""

    name: str | None = Field(None, min_length=1)
    code: str | None = None
    billing_address: str | None = None
    delivery_address: str | None = None
    email: str | None = None
