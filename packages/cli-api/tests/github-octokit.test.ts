import { describe, expect, test } from 'bun:test'
import { GitHubApiError, GitHubClient } from '../src/github/octokit'

interface FetchCall {
  readonly url: string
  readonly method: string
  readonly headers: Record<string, string>
  readonly body?: string
}

function stubFetch(responses: Response[]): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  let idx = 0
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    const headers: Record<string, string> = {}
    if (init?.headers) {
      for (const [k, v] of new Headers(init.headers as HeadersInit).entries()) headers[k] = v
    }
    calls.push({
      url,
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

function jsonOk(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('GitHubClient.request', () => {
  test('attaches auth headers and parses JSON', async () => {
    const { fetchImpl, calls } = stubFetch([jsonOk({ ok: true }, { 'x-ratelimit-remaining': '4999' })])
    const client = new GitHubClient({ token: 'ghp_test', fetchImpl })

    const result = await client.request<{ ok: boolean }>('/repos/o/r')

    expect(result).toEqual({ ok: true })
    expect(calls[0].headers['authorization']).toBe('Bearer ghp_test')
    expect(calls[0].headers['user-agent']).toBe('OrchentraCLI/1.0')
    expect(calls[0].headers['x-github-api-version']).toBe('2022-11-28')
    expect(client.rateLimit?.remaining).toBe(4999)
  })

  test('retries on secondary rate limit then succeeds', async () => {
    const rl = new Response(JSON.stringify({ message: 'secondary rate limit' }), {
      status: 403,
      headers: { 'retry-after': '1' },
    })
    const { fetchImpl, calls } = stubFetch([rl, jsonOk({ ok: true })])
    const client = new GitHubClient({ token: 't', fetchImpl, sleep: async () => {} })

    const result = await client.request<{ ok: boolean }>('/x')
    expect(result).toEqual({ ok: true })
    expect(calls).toHaveLength(2)
  })

  test('does not retry on 404', async () => {
    const { fetchImpl, calls } = stubFetch([new Response('not found', { status: 404 })])
    const client = new GitHubClient({ token: 't', fetchImpl, sleep: async () => {} })

    await expect(client.request('/missing')).rejects.toBeInstanceOf(GitHubApiError)
    expect(calls).toHaveLength(1)
  })

  test('encodes query string', async () => {
    const { fetchImpl, calls } = stubFetch([jsonOk([])])
    const client = new GitHubClient({ token: 't', fetchImpl })

    await client.request('/search', { query: { q: 'foo bar', per_page: 50, empty: undefined } })
    expect(calls[0].url).toContain('q=foo+bar')
    expect(calls[0].url).toContain('per_page=50')
    expect(calls[0].url).not.toContain('empty=')
  })

  test('exhausts retries on persistent rate limit', async () => {
    const rl = (): Response => new Response('secondary rate limit', { status: 403, headers: { 'retry-after': '1' } })
    const { fetchImpl, calls } = stubFetch([rl(), rl(), rl(), rl()])
    const client = new GitHubClient({
      token: 't',
      fetchImpl,
      sleep: async () => {},
      maxRetries: 2,
    })

    await expect(client.request('/x')).rejects.toMatchObject({ status: 403 })
    expect(calls).toHaveLength(3)
  })

  test('sends JSON body on POST', async () => {
    const { fetchImpl, calls } = stubFetch([jsonOk({ id: 1 })])
    const client = new GitHubClient({ token: 't', fetchImpl })

    await client.request('/repos/o/r/issues', { method: 'POST', body: { title: 'x' } })
    expect(calls[0].method).toBe('POST')
    expect(calls[0].body).toBe(JSON.stringify({ title: 'x' }))
  })

  test('requestText returns raw body', async () => {
    const { fetchImpl } = stubFetch([new Response('raw log text', { status: 200 })])
    const client = new GitHubClient({ token: 't', fetchImpl })

    const text = await client.requestText('/repos/o/r/actions/jobs/1/logs')
    expect(text).toBe('raw log text')
  })

  test('throws on empty JSON body for request', async () => {
    const { fetchImpl } = stubFetch([new Response('', { status: 204 })])
    const client = new GitHubClient({ token: 't', fetchImpl })

    await expect(client.request('/repos/o/r/empty')).rejects.toBeInstanceOf(GitHubApiError)
  })
})
