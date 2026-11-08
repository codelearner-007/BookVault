import { safeRedirectPath } from './safe-redirect.js';

// Where auth pages send the user; next/returnTo values are same-site paths only (CS-18).
export const AUTH_ROUTES = {
  login: '/auth/login',
  register: '/auth/register',
  forgot: '/auth/forgot-password',
  reset: '/auth/reset-password',
  verify: '/auth/verify-email',
  mfa: '/auth/2fa',
  changePassword: '/auth/change-password',
  enrolFirst: '/auth/enroll-2fa',
  home: '/admin',
};

// Pages a returnTo must never point at (they would loop back to the sign-in step).
const NO_RETURN = [AUTH_ROUTES.login, AUTH_ROUTES.register, AUTH_ROUTES.mfa];

// A same-site returnTo (CS-18) that never points back into the sign-in steps.
export function returnPath(raw) {
  const path = safeRedirectPath(raw, AUTH_ROUTES.home);
  return NO_RETURN.some((route) => path.startsWith(route)) ? AUTH_ROUTES.home : path;
}

export function withReturnTo(route, returnTo) {
  return returnTo && returnTo !== AUTH_ROUTES.home ? `${route}?returnTo=${encodeURIComponent(returnTo)}` : route;
}

// The next screen after a password sign-in (login response flags of /api/auth/login).
export function nextAfterLogin(response, returnTo) {
  if (response.requiresMFA) return withReturnTo(AUTH_ROUTES.mfa, returnTo);
  if (response.mustChangePassword) return withReturnTo(AUTH_ROUTES.changePassword, returnTo);
  if (response.mfaReenrollRequired) return AUTH_ROUTES.enrolFirst;
  return returnTo;
}
