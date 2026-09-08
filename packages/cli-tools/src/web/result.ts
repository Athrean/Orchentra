import type { ToolResult } from '@orchentra/cli-core'
import { WebError } from './http'

export function webFailure(error: unknown, signal?: AbortSignal): ToolResult {
  const code = signal?.aborted
    ? 'cancelled'
    : error instanceof WebError
      ? error.code
      : error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
        ? 'timeout'
        : 'network_error'
  const message = signal?.aborted ? 'Request cancelled' : error instanceof Error ? error.message : String(error)
  return { content: `${code}: ${message}`, isError: true, data: { code, message } }
}
