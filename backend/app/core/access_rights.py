"""The shared vocabulary of per-area access rights (user decision D-39).

The four right keys exist once per app: here for the backend and in
frontend/src/lib/constants/access-rights.js for the frontend. The DB seed
(`area_rights`) holds the same keys; test_access_right_constants_match_db_seed
fails when they differ.
"""

from enum import StrEnum


class AreaRight(StrEnum):
    VIEW = "view"
    CREATE = "create"
    EDIT = "edit"
    DELETE = "delete"


# Rights that need `view` on the same area (granting adds view; revoking view removes them).
IMPLIES_VIEW = frozenset({AreaRight.CREATE, AreaRight.EDIT, AreaRight.DELETE})


class AccessMode(StrEnum):
    FULL = "full"
    CUSTOM = "custom"


class MemberStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    REMOVED = "removed"


# Area keys the backend refers to by name (all others come from the `areas` seed).
AREA_MEMBERS = "settings.members"
AREA_ACCOUNT_BUSINESSES = "account.businesses"
PLATFORM_MODULE = "platform"
