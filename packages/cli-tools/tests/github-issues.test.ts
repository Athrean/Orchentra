import { describe, expect, test } from 'bun:test'
import { listGitHubIssues, getGitHubIssue } from '../src/github/issues'

interface MockFetchCall {
  url: string
  init?: RequestInit
}

function mockFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>): {
  fetch: typeof fetch
  calls: MockFetchCall[]
} {
  const calls: MockFetchCall[] = []
  let i = 0
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: typeof input === 'string' ? input : (input as Request).url, init })
    const r = responses[i++] ?? responses[responses.length - 1]!
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json', ...(r.headers ?? {}) },
    })
  }
  return { fetch: fakeFetch, calls }
}

describe('listGitHubIssues', () => {
  test('hits /repos/:o/:r/issues with state=open by default', async () => {
    const { fetch: f, calls } = mockFetch([{ status: 200, body: [{ number: 1, title: 'bug', state: 'open' }] }])
    const result = await listGitHubIssues({ repo: 'Athrean/Orchentra' }, { token: 'ghp_test', fetchImpl: f })
    expect(result.isError).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toMatchObject({ number: 1, title: 'bug', state: 'open' })
    expect(calls[0]!.url).toContain('/repos/Athrean/Orchentra/issues')
    expect(calls[0]!.url).toContain('state=open')
  })

  test('forwards labels as comma-joined query', async () => {
    const { fetch: f, calls } = mockFetch([{ status: 200, body: [] }])
    await listGitHubIssues({ repo: 'a/b', labels: ['frontend', 'bug'] }, { token: 'ghp_test', fetchImpl: f })
    expect(calls[0]!.url).toContain('labels=frontend%2Cbug')
  })

  test('accepts URL form via parseGitHubUrl', async () => {
    const { fetch: f, calls } = mockFetch([{ status: 200, body: [] }])
    await listGitHubIssues({ repo: 'https://github.com/a/b/issues' }, { token: 'ghp_test', fetchImpl: f })
    expect(calls[0]!.url).toContain('/repos/a/b/issues')
  })

  test('returns structured error on invalid repo', async () => {
    const { fetch: f } = mockFetch([])
    const result = await listGitHubIssues({ repo: 'not a repo' }, { token: 'ghp_test', fetchImpl: f })
    expect(result.isError).toBe(true)
    expect(result.error).toContain('owner/repo')
  })

  test('returns structured error on missing token', async () => {
    const { fetch: f } = mockFetch([])
    const result = await listGitHubIssues({ repo: 'a/b' }, { token: null, fetchImpl: f })
    expect(result.isError).toBe(true)
    expect(result.error).toMatch(/token/i)
  })

  test('surfaces 404 with remediation hint', async () => {
    const { fetch: f } = mockFetch([{ status: 404, body: { message: 'Not Found' } }])
    const result = await listGitHubIssues({ repo: 'a/private-repo' }, { token: 'ghp_test', fetchImpl: f })
    expect(result.isError).toBe(true)
    expect(result.error).toContain('404')
  })

  test('clamps limit to 1-100', async () => {
    const { fetch: f, calls } = mockFetch([{ status: 200, body: [] }])
    await listGitHubIssues({ repo: 'a/b', limit: 999 }, { token: 'ghp_test', fetchImpl: f })
    expect(calls[0]!.url).toContain('per_page=100')
  })

  test('strips PR entries (GitHub returns PRs in /issues by default)', async () => {
    const { fetch: f } = mockFetch([
      {
        status: 200,
        body: [
          { number: 1, title: 'real issue', state: 'open' },
          { number: 2, title: 'a PR', state: 'open', pull_request: { url: 'x' } },
        ],
      },
    ])
    const result = await listGitHubIssues({ repo: 'a/b' }, { token: 'ghp_test', fetchImpl: f })
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]!.number).toBe(1)
  })
})

describe('getGitHubIssue', () => {
  test('hits /repos/:o/:r/issues/:n', async () => {
    const { fetch: f, calls } = mockFetch([
      {
        status: 200,
        body: {
          number: 42,
          title: 'X',
          body: 'desc',
          state: 'open',
          labels: [{ name: 'bug' }, { name: 'frontend' }],
          html_url: 'https://github.com/a/b/issues/42',
        },
      },
    ])
    const result = await getGitHubIssue({ repo: 'a/b', number: 42 }, { token: 'ghp_test', fetchImpl: f })
    expect(result.isError).toBe(false)
    expect(result.issue).toMatchObject({
      number: 42,
      title: 'X',
      state: 'open',
      labels: ['bug', 'frontend'],
      url: 'https://github.com/a/b/issues/42',
    })
    expect(calls[0]!.url).toContain('/repos/a/b/issues/42')
  })

  test('returns error on missing number', async () => {
    const { fetch: f } = mockFetch([])
    const result = await getGitHubIssue({ repo: 'a/b', number: 0 }, { token: 'ghp_test', fetchImpl: f })
    expect(result.isError).toBe(true)
  })
})
