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
  const config = options.config ?? DEFAULT_RETRY_CONFIG
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
