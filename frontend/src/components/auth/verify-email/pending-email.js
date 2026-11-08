// The address a signup just sent a verification link to, kept for this tab only so the
// verify page can name it without putting an email address in the URL.
const KEY = 'bookvault.pendingEmail';

export function rememberPendingEmail(email) {
  try {
    sessionStorage.setItem(KEY, email);
  } catch {
    // storage unavailable: the page falls back to the generic text
  }
}

export function readPendingEmail() {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

// GoTrue reports a failed emailed link in the URL hash (#error_code=otp_expired) or, via
// the auth callback, as ?status=expired / ?status=invalid.
export function linkFailedInUrl(searchParams) {
  if (['expired', 'invalid'].includes(searchParams.get('status'))) return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.hash.slice(1)).has('error_code');
}
