"""Identifier helpers shared by services."""

import uuid


def is_uuid(value: object) -> bool:
    """Return True when value is a string holding a well-formed UUID."""
    if not isinstance(value, str):
        return False
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True
