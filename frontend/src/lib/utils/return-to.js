export function sanitizeReturnTo(input, fallback = '/app') {
  if (!input) return fallback;

  // Only allow internal absolute paths.
  // Disallow protocol-relative URLs (//evil.com) and absolute URLs (https://evil.com).
  if (!input.startsWith('/') || input.startsWith('//') || input.includes('://')) {
    return fallback;
  }

  // Restrict to app routes only.
  if (!input.startsWith('/app')) return fallback;

  // Basic header/URL injection hardening.
  if (/[\\r\\n]/.test(input)) return fallback;

  return input;
}
