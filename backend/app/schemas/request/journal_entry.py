"""Journal entry and book-settings request schemas (B1)."""

from datetime import date
from decimal import Decimal

from pydantic import Field, model_validator

from app.schemas.common import (
    LIST_MAX,
    IdStr,
    NonNegativeMoney,
    OptionalCode,
    OptionalText,
    RequestModel,
    VersionedRequest,
)


class AmountsIn(RequestModel):
    """Debit and credit of one line; at most one side may be non-zero."""

    debit: NonNegativeMoney = Decimal(0)
    credit: NonNegativeMoney = Decimal(0)

    @model_validator(mode="after")
    def _one_side(self) -> "AmountsIn":
        if self.debit > 0 and self.credit > 0:
            raise ValueError("A line has either a debit or a credit, not both")
        return self


class JournalLineIn(AmountsIn):
    account_id: IdStr
    description: OptionalText = None


class JournalEntryFields(RequestModel):
    date: date
    reference: OptionalCode = None
    description: OptionalText = None
    lines: list[JournalLineIn] = Field(min_length=1, max_length=LIST_MAX)


class CreateJournalEntryRequest(JournalEntryFields):
    """post=false saves a draft (may be unbalanced); post=true posts at once."""

    post: bool = False


class UpdateJournalEntryRequest(VersionedRequest):
    date: date
    reference: OptionalCode = None
    description: OptionalText = None
    lines: list[JournalLineIn] = Field(min_length=1, max_length=LIST_MAX)


class DocumentActionRequest(VersionedRequest):
    """Post or void: the version the client read."""


class JournalTotalsRequest(RequestModel):
    lines: list[AmountsIn] = Field(max_length=LIST_MAX)


class UpdateBooksSettingsRequest(VersionedRequest):
    """Books start date and lock date; a reason is required to move the lock earlier or remove it."""

    books_start_date: date
    lock_date: date | None = None
    reason: OptionalText = None
