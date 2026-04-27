export type ErrorClass = 'retryable' | 'permanent'

export interface ToolErrorOptions {
  retryable: boolean
  cause?: unknown
}

export class ToolError extends Error {
  readonly retryable: boolean
  constructor(message: string, options: ToolErrorOptions) {
    super(message)
    this.name = 'ToolError'
    this.retryable = options.retryable
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause
  }
}

export function classifyError(error: unknown): ErrorClass {
  if (error instanceof ToolError) return error.retryable ? 'retryable' : 'permanent'
  if (error instanceof Response) {
    const s = error.status
    if (s === 429 || (s >= 500 && s < 600)) return 'retryable'
    return 'permanent'
  }
  if (error && typeof error === 'object' && 'status' in error) {
    const s = (error as { status: number }).status
    if (s === 429 || (s >= 500 && s < 600)) return 'retryable'
    return 'permanent'
  }
  if (error instanceof TypeError && error.message.includes('fetch')) return 'retryable'
  if (error instanceof Error && error.message.includes('ECONNRESET')) return 'retryable'
  if (error instanceof Error && error.message.includes('ETIMEDOUT')) return 'retryable'
  return 'permanent'
}

export interface RetryOptions {
  maxAttempts: number
  initialMs: number
  maxMs: number
}

export const LLM_RETRY: RetryOptions = { maxAttempts: 3, initialMs: 10_000, maxMs: 60_000 }
export const TOOL_RETRY: RetryOptions = { maxAttempts: 3, initialMs: 200, maxMs: 2_000 }

function backoffMs(attempt: number, opts: RetryOptions): number {
  return Math.min(opts.initialMs * Math.pow(2, attempt - 1), opts.maxMs)
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = LLM_RETRY): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt >= opts.maxAttempts || classifyError(err) === 'permanent') throw err
      const delay = backoffMs(attempt, opts)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}
