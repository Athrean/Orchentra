import { describe, expect, test } from 'bun:test'
import { listGitHubPulls, getGitHubPull } from '../src/github/pulls'

interface MockFetchCall {
  url: string
  init?: RequestInit
}

function mockFetch(responses: Array<{ status: number; body: unknown }>): {
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
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetch: fakeFetch, calls }
}

describe('listGitHubPulls', () => {
  test('hits /repos/:o/:r/pulls with state=open by default', async () => {
    const { fetch: f, calls } = mockFetch([
      {
        status: 200,
        body: [
          {
            number: 7,
            title: 'fix bug',
            state: 'open',
            draft: false,
            user: { login: 'alice' },
            base: { ref: 'main' },
            head: { ref: 'fix/bug' },
            html_url: 'https://github.com/a/b/pull/7',
          },
        ],
      },
    ])
    const result = await listGitHubPulls({ repo: 'a/b' }, { token: 'ghp_test', fetchImpl: f })
    expect(result.isError).toBe(false)
    expect(result.pulls).toHaveLength(1)
    expect(result.pulls[0]).toMatchObject({
      number: 7,
      title: 'fix bug',
      state: 'open',
      draft: false,
      user: 'alice',
      base: 'main',
      head: 'fix/bug',
      url: 'https://github.com/a/b/pull/7',
    })
    expect(calls[0]!.url).toContain('/repos/a/b/pulls')
    expect(calls[0]!.url).toContain('state=open')
  })

  test('forwards base + head filters', async () => {
    const { fetch: f, calls } = mockFetch([{ status: 200, body: [] }])
    await listGitHubPulls(
      { repo: 'a/b', state: 'closed', base: 'main', head: 'feat/x' },
      { token: 'ghp_test', fetchImpl: f },
    )
    expect(calls[0]!.url).toContain('state=closed')
    expect(calls[0]!.url).toContain('base=main')
    expect(calls[0]!.url).toContain('head=feat%2Fx')
  })

  test('returns structured error on invalid repo', async () => {
    const { fetch: f } = mockFetch([])
    const result = await listGitHubPulls({ repo: 'bogus' }, { token: 'ghp_test', fetchImpl: f })
    expect(result.isError).toBe(true)
  })

  test('returns structured error on missing token', async () => {
    const { fetch: f } = mockFetch([])
    const result = await listGitHubPulls({ repo: 'a/b' }, { token: null, fetchImpl: f })
    expect(result.isError).toBe(true)
    expect(result.error).toMatch(/token/i)
  })
})

describe('getGitHubPull', () => {
  test('returns detail with body + files', async () => {
    const { fetch: f, calls } = mockFetch([
      {
        status: 200,
        body: {
          number: 12,
          title: 'PR title',
          body: 'description',
          state: 'open',
          merged: false,
          mergeable: true,
          draft: false,
          user: { login: 'bob' },
          base: { ref: 'main' },
          head: { ref: 'feat/x' },
          html_url: 'https://github.com/a/b/pull/12',
        },
      },
      {
        status: 200,
        body: [
          { filename: 'src/a.ts', status: 'modified', additions: 4, deletions: 2 },
          { filename: 'src/b.ts', status: 'added', additions: 10, deletions: 0 },
        ],
      },
    ])
    const result = await getGitHubPull({ repo: 'a/b', number: 12 }, { token: 'ghp_test', fetchImpl: f })
    expect(result.isError).toBe(false)
    expect(result.pull).toMatchObject({
      number: 12,
      title: 'PR title',
      body: 'description',
      mergeable: true,
      merged: false,
      base: 'main',
      head: 'feat/x',
    })
    expect(result.pull!.files).toEqual([
      { filename: 'src/a.ts', status: 'modified', additions: 4, deletions: 2 },
      { filename: 'src/b.ts', status: 'added', additions: 10, deletions: 0 },
    ])
    expect(calls[0]!.url).toContain('/repos/a/b/pulls/12')
    expect(calls[1]!.url).toContain('/repos/a/b/pulls/12/files')
  })

  test('rejects non-positive number', async () => {
    const { fetch: f } = mockFetch([])
    const result = await getGitHubPull({ repo: 'a/b', number: -1 }, { token: 'ghp_test', fetchImpl: f })
    expect(result.isError).toBe(true)
  })
})
