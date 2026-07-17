/** Minimal fixed-window rate limiter.
 *
 * In-memory, so it is per-process. That is sufficient today because the app runs
 * as a single long-lived Node process (docs/architecture.md §8) — but it is
 * exactly the kind of state that silently stops working behind a second
 * instance, where each process would enforce its own separate allowance. If the
 * app is ever scaled horizontally, this must move to shared storage. The same
 * caveat applies to Socket.IO rooms, and for the same reason.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets. For the Retry-After header. */
  retryAfter: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now >= existing.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
  return { allowed: true, retryAfter: 0 };
}

/** Drops expired windows. Without this the Map grows for every key ever seen,
 *  which is a slow leak in a long-lived process. */
export function pruneRateLimits(): void {
  const now = Date.now();
  for (const [key, window] of windows) {
    if (now >= window.resetAt) windows.delete(key);
  }
}
