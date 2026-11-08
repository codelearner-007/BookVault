// Sidebar states, cycled by the toggle button and Ctrl/Cmd+B. Kept in a cookie so the server renders the right width.
export const SIDEBAR_STATES = ['expanded', 'icons', 'hidden'];
export const SIDEBAR_COOKIE = 'bv_sidebar';
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const DESKTOP_QUERY = '(min-width: 64rem)';

export function readSidebarState(value) {
  return SIDEBAR_STATES.includes(value) ? value : SIDEBAR_STATES[0];
}

export function nextSidebarState(state) {
  return SIDEBAR_STATES[(SIDEBAR_STATES.indexOf(state) + 1) % SIDEBAR_STATES.length];
}
