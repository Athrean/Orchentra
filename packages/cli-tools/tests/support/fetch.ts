/**
 * Recording fetch stub for the GitHub tool tests.
 *
 * Differs from the cli-api stub on purpose: these tests describe responses as
 * plain `{ status, body }` and let the stub do the JSON encoding, rather than
 * constructing Response objects themselves.
 */

export interface StubResponse {
  readonly status: number
  readonly body: unknown
  readonly headers?: Record<string, string>
}

export interface FetchCall {
  readonly url: string
  readonly init?: RequestInit
}

export function fakeFetch(responses: StubResponse[]): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  let idx = 0
  const impl: typeof fetch = async (input, init) => {
    calls.push({ url: typeof input === 'string' ? input : (input as Request).url, init })
    const next = responses[idx++] ?? responses[responses.length - 1]!
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json', ...(next.headers ?? {}) },
    })
  }
  return { fetch: impl, calls }
}
