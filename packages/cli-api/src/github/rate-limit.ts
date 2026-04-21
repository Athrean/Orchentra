export interface RateLimitState {
  readonly remaining: number | null
  readonly limit: number | null
  readonly resetAtMs: number | null
}

export function readRateLimit(headers: Headers): RateLimitState {
  const remainingRaw = headers.get('x-ratelimit-remaining')
  const limitRaw = headers.get('x-ratelimit-limit')
  const resetRaw = headers.get('x-ratelimit-reset')

  return {
    remaining: remainingRaw === null ? null : Number(remainingRaw),
    limit: limitRaw === null ? null : Number(limitRaw),
    resetAtMs: resetRaw === null ? null : Number(resetRaw) * 1000,
  }
}

export function retryAfterMs(headers: Headers): number | null {
  const raw = headers.get('retry-after')
  if (!raw) return null
  const asSeconds = Number(raw)
  if (Number.isFinite(asSeconds)) return asSeconds * 1000
  const asDate = Date.parse(raw)
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now())
  return null
}

export function isPrimaryRateLimit(status: number, headers: Headers): boolean {
  if (status !== 403 && status !== 429) return false
  const remaining = headers.get('x-ratelimit-remaining')
  return remaining !== null && Number(remaining) === 0
}

export function isSecondaryRateLimit(status: number, body: string): boolean {
  if (status !== 403 && status !== 429) return false
  const lower = body.toLowerCase()
  return lower.includes('secondary rate limit') || lower.includes('abuse detection')
}

export function nextDelayMs(headers: Headers, body: string, status: number, attempt: number): number | null {
  const retryAfter = retryAfterMs(headers)
  if (retryAfter !== null) return retryAfter

  if (isPrimaryRateLimit(status, headers)) {
    const reset = Number(headers.get('x-ratelimit-reset'))
    if (Number.isFinite(reset)) return Math.max(0, reset * 1000 - Date.now())
  }

  if (isSecondaryRateLimit(status, body)) {
    return Math.min(60_000, 1000 * Math.pow(2, attempt))
  }

  return null
}
