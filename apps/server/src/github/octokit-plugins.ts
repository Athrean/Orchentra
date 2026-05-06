/**
 * Shared `@octokit/plugin-throttling` configuration. Both the App and PAT
 * Octokit builders compose with `throttling + retry`; this module owns the
 * onRateLimit / onSecondaryRateLimit callbacks so behaviour stays consistent
 * across auth strategies.
 *
 * Defaults:
 * - First retry on primary rate-limit hit. Drops further retries to avoid
 *   amplifying a quota burn.
 * - First retry on secondary rate-limit (abuse-detection) hit. Same reason.
 * - Logs a warning when remaining quota dips below the soft floor so operators
 *   notice noisy callers before the limit is exhausted.
 */

const SOFT_REMAINING_FLOOR = 100

export interface ThrottleEvent {
  retryAfter: number
  request: { method: string; url: string }
  retryCount: number
}

export interface ThrottleOptions {
  onRateLimit: (retryAfter: number, options: ThrottleEvent['request'], _o: unknown, retryCount: number) => boolean
  onSecondaryRateLimit: (
    retryAfter: number,
    options: ThrottleEvent['request'],
    _o: unknown,
    retryCount: number,
  ) => boolean
}

export function buildThrottleOptions(scope: string, log: typeof console = console): ThrottleOptions {
  return {
    onRateLimit: (retryAfter, options, _o, retryCount) => {
      log.warn(
        `[octokit-throttle:${scope}] primary rate-limit hit on ${options.method} ${options.url}; retry after ${retryAfter}s`,
      )
      // Retry once, then give up — bursting past a primary quota wall is a bug,
      // not a transient. Surface it instead of hammering.
      return retryCount < 1
    },
    onSecondaryRateLimit: (retryAfter, options, _o, retryCount) => {
      log.warn(
        `[octokit-throttle:${scope}] secondary rate-limit (abuse-detection) on ${options.method} ${options.url}; retry after ${retryAfter}s`,
      )
      return retryCount < 1
    },
  }
}

/** Soft floor for the X-RateLimit-Remaining header. Exported so the response
 * hook in the adapter can warn before the quota is exhausted. */
export { SOFT_REMAINING_FLOOR }
