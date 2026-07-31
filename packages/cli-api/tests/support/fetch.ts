/**
 * Recording fetch stub for GitHubClient tests.
 *
 * Every github-*.test.ts in this package was rebuilding the same queue-of-
 * responses stub with the same call recorder. Responses are returned in
 * order; the last one repeats once the queue is exhausted, so a test that
 * only cares about one response can pass a single-element array.
 */

export interface FetchCall {
  readonly url: string
  readonly method: string
  readonly headers: Record<string, string>
  readonly body?: string
}

export function stubFetch(responses: Response[]): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  let idx = 0
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {}
    if (init?.headers) {
      for (const [key, value] of new Headers(init.headers as HeadersInit).entries()) headers[key] = value
    }
    calls.push({
      url: typeof input === 'string' ? input : input.toString(),
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? init.body : undefined,
    })
    const response = responses[idx] ?? responses[responses.length - 1]
    idx++
    return response
  }) as typeof fetch
  return { fetchImpl, calls }
}
