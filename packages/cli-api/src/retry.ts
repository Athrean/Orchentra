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
  const jitter = Math.floor(Math.random() * base)
  return base + jitter
}
