/**
 * In-memory fixed-window counter (no Next.js imports, unit-tested).
 * One process only: behind several server instances use a shared store instead
 * (docs/runbooks/auth-config.md). GoTrue's own limits stay in force either way.
 */
const MAX_TRACKED_KEYS = 10_000;

export function createFixedWindow(now = () => Date.now()) {
  const windows = new Map();

  function prune(at) {
    if (windows.size < MAX_TRACKED_KEYS) return;
    for (const [key, entry] of windows) {
      if (entry.resetAt <= at) windows.delete(key);
    }
  }

  /** Count one hit for `key`; returns { allowed, retryAfterSeconds }. */
  function hit(key, max, windowSeconds) {
    const at = now();
    prune(at);
    let entry = windows.get(key);
    if (!entry || entry.resetAt <= at) {
      entry = { count: 0, resetAt: at + windowSeconds * 1000 };
      windows.set(key, entry);
    }
    entry.count += 1;
    return {
      allowed: entry.count <= max,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - at) / 1000)),
    };
  }

  return { hit, reset: () => windows.clear() };
}
