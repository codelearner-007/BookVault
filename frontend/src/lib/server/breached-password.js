import { createHash } from 'node:crypto';

const RANGE_API = 'https://api.pwnedpasswords.com/range/';
const PREFIX_LENGTH = 5;

/**
 * Breached-password pre-check (D-24) with the HIBP k-anonymity range API: only the
 * first 5 hex characters of the SHA-1 leave the server. Fails OPEN with a warning when
 * the API is unreachable (availability over lockout). On the hosted project GoTrue's own
 * leaked-password protection enforces the same rule for direct calls.
 */
export async function isBreachedPassword(password, { mode, timeoutMs, fetchImpl = fetch }) {
  if (mode !== 'hibp') return false;
  const digest = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = digest.slice(0, PREFIX_LENGTH);
  const suffix = digest.slice(PREFIX_LENGTH);
  try {
    const response = await fetchImpl(`${RANGE_API}${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`HIBP status ${response.status}`);
    const body = await response.text();
    return body.split('\n').some((line) => {
      const [hashSuffix, count] = line.trim().split(':');
      return hashSuffix === suffix && Number(count) > 0;
    });
  } catch (error) {
    console.warn('Breached-password check unavailable, allowing the password:', error?.message);
    return false;
  }
}
