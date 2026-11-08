const PROBE_ORIGIN = 'http://same-origin.invalid';

/**
 * Return `raw` only when it is a same-origin path ("/x"), otherwise `fallback`.
 * Rejects protocol-relative ("//evil"), backslash ("/\evil") and absolute URLs (CS-18).
 */
export function safeRedirectPath(raw, fallback = '/app') {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return fallback;
  }
  try {
    const url = new URL(raw, PROBE_ORIGIN);
    return url.origin === PROBE_ORIGIN ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
