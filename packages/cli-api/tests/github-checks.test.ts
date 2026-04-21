import { describe, expect, test } from 'bun:test'
import { GitHubClient } from '../src/github/octokit'
import { upsertCheckRun } from '../src/github/checks'

interface RecordedCall {
  url: string
  method: string
  body?: unknown
}

function stub(handler: (call: RecordedCall) => Response): {
  fetchImpl: typeof fetch
  calls: RecordedCall[]
} {
  const calls: RecordedCall[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const call = { url, method: init?.method ?? 'GET', body }
    calls.push(call)
    return handler(call)
  }) as typeof fetch
  return { fetchImpl, calls }
}

describe('upsertCheckRun', () => {
  test('creates new when externalId absent from existing list', async () => {
    const { fetchImpl, calls } = stub((call) => {
      if (call.url.includes('/check-runs') && call.method === 'GET') {
        return new Response(JSON.stringify({ check_runs: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (call.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 11,
            name: 'x',
            external_id: 'orchentra-triage-1',
            head_sha: 'abc',
            html_url: '',
            status: 'completed',
            conclusion: 'failure',
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response('no', { status: 404 })
    })

    const client = new GitHubClient({ token: 't', fetchImpl })
    const result = await upsertCheckRun(client, 'o', 'r', {
      name: 'x',
      headSha: 'abc',
      status: 'completed',
      conclusion: 'failure',
      externalId: 'orchentra-triage-1',
    })

    expect(result.id).toBe(11)
    expect(calls[1].method).toBe('POST')
  })

  test('updates existing when externalId matches', async () => {
    const { fetchImpl, calls } = stub((call) => {
      if (call.url.includes('/check-runs') && call.method === 'GET') {
        return new Response(
          JSON.stringify({
            check_runs: [
              {
                id: 77,
                name: 'x',
                external_id: 'orchentra-triage-1',
                head_sha: 'abc',
                html_url: '',
                status: 'completed',
                conclusion: 'failure',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (call.method === 'PATCH') {
        return new Response(
          JSON.stringify({
            id: 77,
            name: 'x',
            external_id: 'orchentra-triage-1',
            head_sha: 'abc',
            html_url: '',
            status: 'completed',
            conclusion: 'success',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response('no', { status: 404 })
    })

    const client = new GitHubClient({ token: 't', fetchImpl })
    const result = await upsertCheckRun(client, 'o', 'r', {
      name: 'x',
      headSha: 'abc',
      status: 'completed',
      conclusion: 'success',
      externalId: 'orchentra-triage-1',
    })

    expect(result.id).toBe(77)
    expect(calls[1].method).toBe('PATCH')
    expect(calls[1].url).toContain('/check-runs/77')
  })
})
