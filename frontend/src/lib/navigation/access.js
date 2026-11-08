import { ACCESS_MODE_FULL, RIGHT_VIEW } from '@/lib/constants/access-rights';

const OWNER_ONLY = Symbol('owner-only');

// True when my access in this business includes `right` on `area`. Owners have every right; full members
// every right except owner-only areas (member management), which Full access never covers.
export function can(access, area, right = RIGHT_VIEW) {
  if (!access) return false;
  if (access.is_owner) return true;
  if (area === OWNER_ONLY) return false;
  if (access.access_mode === ACCESS_MODE_FULL) return true;
  return access.areas.some((entry) => entry.area_key === area && entry.rights.includes(right));
}

export const AREA = {
  ownerOnly: OWNER_ONLY,
  customizeTabs: 'settings.customize_tabs',
  history: 'history',
};
