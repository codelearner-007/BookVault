import { useSyncExternalStore } from 'react';

// The business the user last opened in this browser (the dashboard's "Open ..." quick action).
const LAST_BUSINESS_KEY = 'bv_last_business';

export function rememberLastBusiness(businessId) {
  try {
    window.localStorage.setItem(LAST_BUSINESS_KEY, businessId);
  } catch {
    // Storage can be unavailable (private mode, quota); the quick action is simply not shown.
  }
}

function readLastBusiness() {
  try {
    return window.localStorage.getItem(LAST_BUSINESS_KEY);
  } catch {
    return null;
  }
}

const subscribe = () => () => {};

// null on the server and during hydration, then the stored id.
export function useLastBusinessId() {
  return useSyncExternalStore(subscribe, readLastBusiness, () => null);
}
