export type FailureClass =
  | 'provider_auth'
  | 'provider_rate_limit'
  | 'context_window'
  | 'provider_transport'
  | 'provider_internal'
  | 'provider_error'
  | 'provider_retry_exhausted'

export interface AnthropicApiError {
  readonly status: number
  readonly errorType?: string
  readonly message: string
  readonly requestId?: string
  readonly retryable: boolean
  readonly failureClass: FailureClass
}

const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504])

const CONTEXT_WINDOW_MARKERS = [
  'maximum context length',
  'context window',
  'context length',
  'too many tokens',
  'prompt is too long',
  'input is too long',
  'request is too large',
]

const FATAL_WRAPPER_MARKERS = [
  'something went wrong while processing your request',
  'please try again, or use /new to start a fresh session',
]

function matchesMarkers(text: string, markers: string[]): boolean {
  const lower = text.toLowerCase()
  return markers.some((m) => lower.includes(m))
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status)
}

export function classifyError(status: number, body: string, errorType?: string): AnthropicApiError {
  const retryable = isRetryableStatus(status)
  let failureClass: FailureClass

  if (status === 401 || status === 403) {
    failureClass = 'provider_auth'
  } else if (status === 429) {
    failureClass = 'provider_rate_limit'
  } else if ((status === 400 || status === 413 || status === 422) && matchesMarkers(body, CONTEXT_WINDOW_MARKERS)) {
    failureClass = 'context_window'
  } else if (matchesMarkers(body, FATAL_WRAPPER_MARKERS)) {
    failureClass = 'provider_internal'
  } else if (status >= 500 || status === 408) {
    failureClass = 'provider_transport'
  } else {
    failureClass = 'provider_error'
  }

  let message: string
  try {
    const parsed = JSON.parse(body)
    message = parsed?.error?.message ?? body
  } catch {
    message = body
  }

  return {
    status,
    errorType,
    message,
    retryable,
    failureClass,
  }
}

export function enrichAuthError(error: AnthropicApiError, authSource: string): AnthropicApiError {
  if (error.status === 401 && authSource === 'bearer' && error.message.startsWith('sk-ant-')) {
    return {
      ...error,
      message:
        error.message +
        ' sk-ant-* keys go in ANTHROPIC_API_KEY (x-api-key header), not ANTHROPIC_AUTH_TOKEN (Bearer header).',
    }
  }
  return error
}

export function missingCredentialsError(): AnthropicApiError {
  return {
    status: 0,
    message: 'No API key found. Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN environment variable.',
    retryable: false,
    failureClass: 'provider_auth',
  }
}
