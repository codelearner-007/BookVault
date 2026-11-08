// Shared vocabulary of per-area access rights (user decision D-39). Mirrors
// backend/app/core/access_rights.py and the `area_rights` seed; the backend test
// test_access_right_constants_match_db_seed fails when they differ.

export const RIGHT_VIEW = 'view';
export const RIGHT_CREATE = 'create';
export const RIGHT_EDIT = 'edit';
export const RIGHT_DELETE = 'delete';

export const AREA_RIGHTS = [RIGHT_VIEW, RIGHT_CREATE, RIGHT_EDIT, RIGHT_DELETE];

// Rights that need `view` on the same area (granting adds view; revoking view removes them).
export const IMPLIES_VIEW = [RIGHT_CREATE, RIGHT_EDIT, RIGHT_DELETE];

export const ACCESS_MODE_FULL = 'full';
export const ACCESS_MODE_CUSTOM = 'custom';
export const ACCESS_MODES = [ACCESS_MODE_FULL, ACCESS_MODE_CUSTOM];
