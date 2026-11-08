"""Optimistic-locking helpers shared by the services of versioned records (AC-20)."""

from typing import Any, Iterable

from app.core.exceptions import ValidationError, VersionConflictError
from app.schemas.common import VersionedRequest


def check_version(entity: Any, expected: int) -> None:
    """409 when the client edited an older version; the UPDATE ... WHERE version guards races."""
    if entity.version != expected:
        raise VersionConflictError()


def changed_fields(body: VersionedRequest, required: Iterable[str] = ()) -> dict[str, Any]:
    """Fields the client sent (minus version); a required field may not be cleared."""
    fields = {k: getattr(body, k) for k in body.model_fields_set if k != "version"}
    for name in required:
        if name in fields and fields[name] is None:
            raise ValidationError(f"{name} cannot be empty", name)
    return fields


def apply_versioned_update(entity: Any, body: VersionedRequest, required: Iterable[str] = ()) -> None:
    check_version(entity, body.version)
    for key, value in changed_fields(body, required).items():
        setattr(entity, key, value)
