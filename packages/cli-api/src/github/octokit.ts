import { nextDelayMs, readRateLimit, type RateLimitState } from './rate-limit'

export interface GitHubClientOptions {
  readonly token: string
  readonly baseUrl?: string
  readonly userAgent?: string
  readonly maxRetries?: number
  readonly fetchImpl?: typeof fetch
  readonly sleep?: (ms: number) => Promise<void>
}

export interface GitHubRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  readonly body?: unknown
  readonly accept?: string
  readonly query?: Record<string, string | number | undefined>
}

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
    readonly requestId?: string,
  ) {
    super(`GitHub ${status} at ${url}: ${body.slice(0, 200)}`)
    this.name = 'GitHubApiError'
  }
}

const DEFAULT_BASE_URL = 'https://api.github.com'
const DEFAULT_USER_AGENT = 'OrchentraCLI/1.0'
const DEFAULT_MAX_RETRIES = 3

export class GitHubClient {
  private readonly token: string
  private readonly baseUrl: string
  private readonly userAgent: string
  private readonly maxRetries: number
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private lastRateLimit: RateLimitState | null = null

  constructor(opts: GitHubClientOptions) {
    this.token = opts.token
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.sleep = opts.sleep ?? ((ms): Promise<void> => new Promise((r) => setTimeout(r, ms)))
  }

  get rateLimit(): RateLimitState | null {
    return this.lastRateLimit
  }

  async request<T>(path: string, options: GitHubRequestOptions = {}): Promise<T> {
    const response = await this.raw(path, options)
    const text = await response.text()
    if (text.length === 0) {
      throw new GitHubApiError(response.status, response.url || path, 'empty response body')
    }
    return JSON.parse(text) as T
  }

  async requestText(path: string, options: GitHubRequestOptions = {}): Promise<string> {
    const response = await this.raw(path, options)
    return response.text()
  }

  private async raw(path: string, options: GitHubRequestOptions): Promise<Response> {
    const url = this.buildUrl(path, options.query)
    const method = options.method ?? 'GET'

    let lastError: GitHubApiError | null = null
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const response = await this.fetchImpl(url, {
        method,
        headers: this.buildHeaders(options.accept),
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      })

      this.lastRateLimit = readRateLimit(response.headers)

      if (response.ok) return response

      const body = await response.text()
      const delay = nextDelayMs(response.headers, body, response.status, attempt)
      lastError = new GitHubApiError(
        response.status,
        url,
        body,
        response.headers.get('x-github-request-id') ?? undefined,
      )

      if (delay !== null && attempt < this.maxRetries) {
        await this.sleep(delay)
        continue
      }
      throw lastError
    }

    throw lastError ?? new GitHubApiError(0, url, 'no response')
  }

  private buildUrl(path: string, query?: GitHubRequestOptions['query']): string {
    const normalized = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`
    if (!query) return normalized
    const entries = Object.entries(query).filter(([, v]) => v !== undefined)
    if (entries.length === 0) return normalized
    const params = new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))
    const joiner = normalized.includes('?') ? '&' : '?'
    return `${normalized}${joiner}${params.toString()}`
  }

  private buildHeaders(accept?: string): Record<string, string> {
    return {
      accept: accept ?? 'application/vnd.github+json',
      authorization: `Bearer ${this.token}`,
      'user-agent': this.userAgent,
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    }
  }
}
