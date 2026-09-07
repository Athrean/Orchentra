export interface RetryConfig {
  maxRetries: number
  initialMs: number
  maxMs: number
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 8,
  initialMs: 1000,
  maxMs: 128000,
}

/**
 * Environment overrides for the retry budget. The defaults suit an interactive
 * turn, where waiting out a rate limit beats failing the user's request. They
 * are wrong for a batch sweep: eight retries reaching a 128s ceiling is over
 * four minutes of sleeping per model call, which turned a ten-case eval on a
 * rate-limited tier into a run that produced nothing before its timeout.
 *
 * Env is the right knob because the eval harness drives the CLI as a
 * subprocess, so a caller can set the budget for a whole sweep without
 * threading it through every layer.
 */
export const RETRY_ENV_VARS = {
  maxRetries: 'ORCHENTRA_RETRY_MAX_ATTEMPTS',
  initialMs: 'ORCHENTRA_RETRY_INITIAL_MS',
  maxMs: 'ORCHENTRA_RETRY_MAX_MS',
} as const

const RETRY_BOUNDS: Record<keyof RetryConfig, { min: number; max: number }> = {
  maxRetries: { min: 0, max: 20 },
  initialMs: { min: 0, max: 60_000 },
  maxMs: { min: 0, max: 600_000 },
}

/**
 * Resolve the retry budget from explicit overrides, then the environment, then
 * the defaults. A malformed or out-of-range value throws rather than falling
 * back: a retry budget that is silently ignored is indistinguishable from one
 * that is being honoured, and the caller would never learn its sweep was still
 * sleeping for four minutes a call.
 */
export function resolveRetryConfig(
  overrides?: Partial<RetryConfig>,
  env: Record<string, string | undefined> = process.env,
): RetryConfig {
  const resolved = { ...DEFAULT_RETRY_CONFIG }
  for (const key of Object.keys(RETRY_BOUNDS) as (keyof RetryConfig)[]) {
    const raw = env[RETRY_ENV_VARS[key]]
    if (raw !== undefined && raw !== '') {
      const parsed = Number(raw)
      const { min, max } = RETRY_BOUNDS[key]
      if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${RETRY_ENV_VARS[key]} must be an integer between ${min} and ${max}; received '${raw}'`)
      }
      resolved[key] = parsed
    }
    const override = overrides?.[key]
    if (override !== undefined) resolved[key] = override
  }
  // A ceiling below the first step would silently shorten every wait.
  if (resolved.maxMs < resolved.initialMs) resolved.maxMs = resolved.initialMs
  return resolved
}

export function computeBackoff(attempt: number, config: RetryConfig): number {
  const base = Math.min(config.initialMs * Math.pow(2, attempt - 1), config.maxMs)
  const jitter = Math.floor(Math.random() * base * 0.25)
  return Math.min(base + jitter, config.maxMs)
}

/**
 * `Retry-After` is either delta-seconds or an HTTP date. A server that names a
 * wait is obeyed over the computed backoff — it knows its own window — but the
 * value is clamped to `maxMs`, so a mistaken or hostile header cannot park a
 * run indefinitely.
 */
export function parseRetryAfter(header: string | null, now: number, maxMs: number): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return seconds <= 0 ? 0 : Math.min(seconds * 1000, maxMs)
  const date = Date.parse(header)
  if (Number.isNaN(date)) return null
  return Math.min(Math.max(0, date - now), maxMs)
}

export interface FetchRetryNotice {
  readonly attempt: number
  readonly maxRetries: number
  readonly delayMs: number
  readonly status?: number
}

export interface FetchRetryOptions {
  readonly config?: RetryConfig
  /** Injected for tests; defaults to a real timer. */
  readonly sleep?: (ms: number) => Promise<void>
  /** Called before each wait, so a caller can report why a turn stalled. */
  readonly onRetry?: (notice: FetchRetryNotice) => void
  readonly signal?: AbortSignal
}

/**
 * Retry a provider request until it returns a non-retryable response or the
 * attempts run out. Only the request/response handshake is retried: once the
 * body has been handed to a stream consumer, replaying would duplicate a
 * partial response, so a mid-stream failure stays the caller's to surface.
 *
 * The final response is returned as-is, retryable or not, so each client keeps
 * its own error classification and body handling.
 */
export async function fetchWithRetry(
  send: () => Promise<Response>,
  isRetryableStatus: (status: number) => boolean,
  options: FetchRetryOptions = {},
): Promise<Response> {
  const config = options.config ?? resolveRetryConfig()
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)))
  let lastError: unknown

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    let response: Response | undefined
    try {
      response = await send()
    } catch (error) {
      // An abort is the caller's decision, never something to retry around.
      if (options.signal?.aborted || (error as { name?: string })?.name === 'AbortError') throw error
      lastError = error
    }

    if (response && !isRetryableStatus(response.status)) return response
    if (attempt === config.maxRetries) {
      if (response) return response
      throw lastError
    }

    const retryAfter = response ? parseRetryAfter(response.headers.get('retry-after'), Date.now(), config.maxMs) : null
    const delayMs = retryAfter ?? computeBackoff(attempt + 1, config)
    options.onRetry?.({
      attempt: attempt + 1,
      maxRetries: config.maxRetries,
      delayMs,
      ...(response ? { status: response.status } : {}),
    })
    // A discarded response body must be consumed or the socket leaks.
    if (response) await response.text().catch(() => '')
    await sleep(delayMs)
  }

  throw lastError ?? new Error('provider request failed')
}
