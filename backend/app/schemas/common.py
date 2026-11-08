"""Common schemas, strict request base model and shared field types (B0.5)."""

import math
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Generic, List, Optional, TypeVar

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, PlainSerializer

from app.core.ids import canonical_uuid

T = TypeVar("T")

# String length limits (CS-14, AC-32)
NAME_MAX = 200
CODE_MAX = 50
EMAIL_MAX = 320
TEXT_MAX = 2000
URL_MAX = 2048
KEY_MAX = 100
LIST_MAX = 500  # items in any request list (lines, reorder ids, columns, tabs)

# Money: numeric(19,4) in the database (domain-model §1)
MONEY_MAX_DIGITS = 19
MONEY_DECIMAL_PLACES = 4
MONEY_LIMIT = Decimal("999999999999999")  # 15 integer digits


def _blank_to_none(value: object) -> object:
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _decimal_str(value: Decimal) -> str:
    return format(value, "f")


IdStr = Annotated[str, Field(max_length=36), AfterValidator(canonical_uuid)]
ShortText = Annotated[str, Field(min_length=1, max_length=NAME_MAX)]
OptionalName = Annotated[Optional[str], BeforeValidator(_blank_to_none), Field(max_length=NAME_MAX)]
OptionalCode = Annotated[Optional[str], BeforeValidator(_blank_to_none), Field(max_length=CODE_MAX)]
OptionalEmail = Annotated[Optional[str], BeforeValidator(_blank_to_none), Field(max_length=EMAIL_MAX)]
OptionalText = Annotated[Optional[str], BeforeValidator(_blank_to_none), Field(max_length=TEXT_MAX)]
OptionalUrl = Annotated[Optional[str], BeforeValidator(_blank_to_none), Field(max_length=URL_MAX)]

# Money in requests: bounded Decimal; floats and exponent strings are parsed by Pydantic
# into Decimal (never float arithmetic). Responses serialise money as strings.
Money = Annotated[
    Decimal,
    Field(max_digits=MONEY_MAX_DIGITS, decimal_places=MONEY_DECIMAL_PLACES,
          ge=-MONEY_LIMIT, le=MONEY_LIMIT),
]
NonNegativeMoney = Annotated[
    Decimal,
    Field(max_digits=MONEY_MAX_DIGITS, decimal_places=MONEY_DECIMAL_PLACES, ge=0, le=MONEY_LIMIT),
]
MoneyOut = Annotated[Decimal, PlainSerializer(_decimal_str, return_type=str)]

Version = Annotated[int, Field(ge=1, description="Version read by the client (optimistic locking)")]


class RequestModel(BaseModel):
    """Base for every request body: unknown fields are rejected (AC-03)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class VersionedRequest(RequestModel):
    """Update body of a versioned record (AC-20)."""

    version: Version


class TimestampSchema(BaseModel):
    """Base schema with timestamp fields."""

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CreatedAtSchema(BaseModel):
    """Base schema with created_at field only (for tables without updated_at)."""

    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedResponse(BaseModel, Generic[T]):
    """Envelope of every list route: {items, page, page_size, total} (+ total_pages)."""

    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int

    @classmethod
    def build(cls, items: list, total: int, page: int, page_size: int, **extra):
        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=math.ceil(total / page_size) if total else 0,
            **extra,
        )


class ErrorResponse(BaseModel):
    """Standard error response returned by all error handlers."""

    error: str
    status_code: int
    details: dict = {}
    request_id: Optional[str] = None
