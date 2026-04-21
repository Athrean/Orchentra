import { describe, expect, test } from 'bun:test'
import { GitHubClient } from '../src/github/octokit'
import {
  createPullRequest,
  findOpenPullByHead,
  listPullsForCommit,
  updatePullRequest,
} from '../src/github/prs'

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('github prs', () => {
  test('listPullsForCommit uses commit pulls preview media type', async () => {
    const { fetchImpl, calls } = stubFetch([jsonResponse([])])
    const client = new GitHubClient({ token: 'ghp_test', fetchImpl })

    const pulls = await listPullsForCommit(client, 'o', 'r', 'sha123')

    expect(pulls).toEqual([])
    expect(calls[0].url).toContain('/repos/o/r/commits/sha123/pulls')
    expect(calls[0].headers.accept).toBe('application/vnd.github.groot-preview+json')
  })

  test('findOpenPullByHead queries open pulls by owner:branch', async () => {
    const openPull = {
      number: 10,
      title: 'fix',
      state: 'open' as const,
      html_url: 'https://github.com/o/r/pull/10',
      head: { ref: 'orchentra/fix/run-1', sha: 'sha-head' },
      base: { ref: 'main', sha: 'sha-base' },
    }
    const { fetchImpl, calls } = stubFetch([jsonResponse([openPull])])
    const client = new GitHubClient({ token: 'ghp_test', fetchImpl })

    const pull = await findOpenPullByHead(client, 'o', 'r', 'orchentra/fix/run-1')

    expect(pull?.number).toBe(10)
    expect(calls[0].url).toContain('head=o%3Aorchentra%2Ffix%2Frun-1')
    expect(calls[0].url).toContain('state=open')
  })

  test('createPullRequest posts payload', async () => {
    const created = {
      number: 11,
      title: 'fix',
      state: 'open' as const,
      html_url: 'https://github.com/o/r/pull/11',
      head: { ref: 'branch', sha: 'sha-head' },
      base: { ref: 'main', sha: 'sha-base' },
    }
    const { fetchImpl, calls } = stubFetch([jsonResponse(created, 201)])
    const client = new GitHubClient({ token: 'ghp_test', fetchImpl })

    const pull = await createPullRequest(client, 'o', 'r', {
      title: 'fix',
      head: 'branch',
      base: 'main',
      body: 'desc',
    })

    expect(pull.number).toBe(11)
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toContain('/repos/o/r/pulls')
    expect(calls[0].body).toBe(
      JSON.stringify({
        title: 'fix',
        head: 'branch',
        base: 'main',
        body: 'desc',
        draft: false,
      }),
    )
  })

  test('updatePullRequest patches title/body', async () => {
    const updated = {
      number: 11,
      title: 'new title',
      state: 'open' as const,
      html_url: 'https://github.com/o/r/pull/11',
      head: { ref: 'branch', sha: 'sha-head' },
      base: { ref: 'main', sha: 'sha-base' },
    }
    const { fetchImpl, calls } = stubFetch([jsonResponse(updated)])
    const client = new GitHubClient({ token: 'ghp_test', fetchImpl })

    const pull = await updatePullRequest(client, 'o', 'r', 11, { title: 'new title', body: 'new body' })

    expect(pull.title).toBe('new title')
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].url).toContain('/repos/o/r/pulls/11')
    expect(calls[0].body).toBe(JSON.stringify({ title: 'new title', body: 'new body' }))
  })
})

