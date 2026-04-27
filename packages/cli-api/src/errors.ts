export type FailureClass =
  | 'provider_auth'
  | 'provider_rate_limit'
  | 'context_window'
  | 'provider_transport'
  | 'provider_internal'
  | 'provider_error'
  | 'provider_retry_exhausted'

export interface AnthropicApiErrorProps {
  readonly status: number
  readonly errorType?: string
  readonly message: string
  readonly requestId?: string
  readonly retryable: boolean
  readonly failureClass: FailureClass
}

// Real Error subclass so `err instanceof Error` and `err.message` work in catch
// sites that don't know about the structured fields. Prior to this, the throw
// sites used a bare object literal, which surfaced as "[object Object]" when
// stringified by generic error handlers.
export class AnthropicApiError extends Error {
  readonly status: number
  readonly errorType?: string
  readonly requestId?: string
  readonly retryable: boolean
  readonly failureClass: FailureClass

  constructor(props: AnthropicApiErrorProps) {
    super(props.message)
    this.name = 'AnthropicApiError'
    this.status = props.status
    this.errorType = props.errorType
    this.requestId = props.requestId
    this.retryable = props.retryable
    this.failureClass = props.failureClass
  }
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

  return new AnthropicApiError({
    status,
    errorType,
    message,
    retryable,
    failureClass,
  })
}

export function enrichAuthError(error: AnthropicApiError, authSource: string, rawToken?: string): AnthropicApiError {
  if (error.status === 401 && authSource === 'bearer' && rawToken && rawToken.startsWith('sk-ant-')) {
    return new AnthropicApiError({
      status: error.status,
      errorType: error.errorType,
      requestId: error.requestId,
      retryable: error.retryable,
      failureClass: error.failureClass,
      message:
        error.message +
        ' sk-ant-* keys go in ANTHROPIC_API_KEY (x-api-key header), not ANTHROPIC_AUTH_TOKEN (Bearer header).',
    })
  }
  return error
}

export function missingCredentialsError(): AnthropicApiError {
  return new AnthropicApiError({
    status: 0,
    message: 'No API key found. Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN environment variable.',
    retryable: false,
    failureClass: 'provider_auth',
  })
}
