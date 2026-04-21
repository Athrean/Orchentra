import { describe, expect, test } from 'bun:test'
import { GitHubClient } from '../src/github/octokit'
import { createCommitStatus } from '../src/github/statuses'

interface FetchCall {
  readonly url: string
  readonly method: string
  readonly body?: string
}

function stubFetch(responses: Response[]): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  let idx = 0
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    })
    const response = responses[idx] ?? responses[responses.length - 1]
    idx++
    return response
  }) as typeof fetch
  return { fetchImpl, calls }
}

describe('createCommitStatus', () => {
  test('posts commit status payload to statuses endpoint', async () => {
    const response = new Response(
      JSON.stringify({
        id: 123,
        state: 'failure',
        context: 'orchentra/triage',
        description: 'boom',
        target_url: 'https://example.com/run/1',
      }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    )
    const { fetchImpl, calls } = stubFetch([response])
    const client = new GitHubClient({ token: 'ghp_test', fetchImpl })

    const status = await createCommitStatus(client, 'o', 'r', {
      sha: 'abc123',
      state: 'failure',
      context: 'orchentra/triage',
      description: 'boom',
      targetUrl: 'https://example.com/run/1',
    })

    expect(status.id).toBe(123)
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toContain('/repos/o/r/statuses/abc123')
    expect(calls[0].body).toBe(
      JSON.stringify({
        state: 'failure',
        context: 'orchentra/triage',
        description: 'boom',
        target_url: 'https://example.com/run/1',
      }),
    )
  })
})
