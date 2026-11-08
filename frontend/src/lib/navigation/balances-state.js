// "Hide balances" is kept per user in a cookie (its value is the user id), so the server renders the masked
// state on the first paint and another person signing in on the same browser does not inherit it.
export const HIDE_BALANCES_COOKIE = 'bv_hide_balances';
export const HIDE_BALANCES_MAX_AGE = 60 * 60 * 24 * 365;

export function readBalancesHidden(cookieValue, userId) {
  return Boolean(userId) && cookieValue === userId;
}
