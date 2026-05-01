import { describe, expect, test } from 'bun:test'
import { searchGitHubIssues } from '../src/github/search'

interface MockFetchCall {
  url: string
}

function mockFetch(responses: Array<{ status: number; body: unknown }>): {
  fetch: typeof fetch
  calls: MockFetchCall[]
} {
  const calls: MockFetchCall[] = []
  let i = 0
  const fakeFetch: typeof fetch = async (input) => {
    calls.push({ url: typeof input === 'string' ? input : (input as Request).url })
    const r = responses[i++] ?? responses[responses.length - 1]!
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetch: fakeFetch, calls }
}

describe('searchGitHubIssues', () => {
  test('hits /search/issues with q + per_page', async () => {
    const { fetch: f, calls } = mockFetch([
      {
        status: 200,
        body: {
          total_count: 1,
          items: [
            {
              number: 5,
              title: 'frontend bug',
              state: 'open',
              labels: [{ name: 'frontend' }],
              html_url: 'https://github.com/a/b/issues/5',
              repository_url: 'https://api.github.com/repos/a/b',
            },
          ],
        },
      },
    ])
    const result = await searchGitHubIssues(
      { q: 'repo:a/b label:frontend is:issue is:open' },
      { token: 'ghp_test', fetchImpl: f },
    )
    expect(result.isError).toBe(false)
    expect(result.totalCount).toBe(1)
    expect(result.items[0]).toMatchObject({
      number: 5,
      title: 'frontend bug',
      state: 'open',
      labels: ['frontend'],
      repo: 'a/b',
      url: 'https://github.com/a/b/issues/5',
    })
    expect(calls[0]!.url).toContain('/search/issues')
    expect(calls[0]!.url).toContain('q=repo%3Aa%2Fb+label%3Afrontend+is%3Aissue+is%3Aopen')
  })

  test('clamps limit to 100 (search API max)', async () => {
    const { fetch: f, calls } = mockFetch([{ status: 200, body: { total_count: 0, items: [] } }])
    await searchGitHubIssues({ q: 'x', limit: 999 }, { token: 'ghp_test', fetchImpl: f })
    expect(calls[0]!.url).toContain('per_page=100')
  })

  test('rejects empty query', async () => {
    const { fetch: f } = mockFetch([])
    const result = await searchGitHubIssues({ q: '   ' }, { token: 'ghp_test', fetchImpl: f })
    expect(result.isError).toBe(true)
    expect(result.error).toMatch(/query/i)
  })

  test('returns structured error on missing token', async () => {
    const { fetch: f } = mockFetch([])
    const result = await searchGitHubIssues({ q: 'x' }, { token: null, fetchImpl: f })
    expect(result.isError).toBe(true)
    expect(result.error).toMatch(/token/i)
  })

  test('surfaces 422 (bad query) with hint', async () => {
    const { fetch: f } = mockFetch([
      { status: 422, body: { message: 'Validation Failed', errors: [{ message: 'bad qualifier' }] } },
    ])
    const result = await searchGitHubIssues({ q: 'bad:qualifier' }, { token: 'ghp_test', fetchImpl: f })
    expect(result.isError).toBe(true)
    expect(result.error).toContain('422')
  })
})
