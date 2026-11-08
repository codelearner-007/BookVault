"""Pagination parameters shared by every list route (B0.5, CS-12, AC-25)."""

from dataclasses import dataclass
from typing import Sequence, TypeVar

from fastapi import Query

from app.core.config import settings

T = TypeVar("T")

SEARCH_MAX = 100


@dataclass(frozen=True)
class PageParams:
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    def slice(self, rows: Sequence[T]) -> list[T]:
        """Page of a small, bounded catalog that is loaded whole (tabs, roles, presets)."""
        return list(rows[self.offset : self.offset + self.page_size])


def page_params(
    page: int = Query(1, ge=1, le=1_000_000),
    page_size: int = Query(settings.PAGE_SIZE_DEFAULT, ge=1, le=settings.PAGE_SIZE_MAX),
) -> PageParams:
    return PageParams(page=page, page_size=page_size)
