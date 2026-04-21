import { describe, expect, test } from 'bun:test'
import { GitHubClient } from '../src/github/octokit'
import { triageMarker, upsertMarkedComment } from '../src/github/comments'

function stubFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    return handler(url, init)
  }) as typeof fetch
}

describe('upsertMarkedComment', () => {
  test('creates when no existing marker', async () => {
    let created = false
    const fetchImpl = stubFetch((url, init) => {
      if (url.includes('/issues/7/comments') && (init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url.includes('/issues/7/comments') && init?.method === 'POST') {
        created = true
        const body = JSON.parse(init.body as string) as { body: string }
        return new Response(JSON.stringify({ id: 1, body: body.body, html_url: '' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response('no', { status: 404 })
    })

    const client = new GitHubClient({ token: 't', fetchImpl })
    const result = await upsertMarkedComment(client, 'o', 'r', 7, 'run-42', 'hello')

    expect(created).toBe(true)
    expect(result.body).toContain(triageMarker('run-42'))
    expect(result.body).toContain('hello')
  })

  test('updates when existing marker matches', async () => {
    let updatedId: number | null = null
    const marker = triageMarker('run-42')
    const fetchImpl = stubFetch((url, init) => {
      if (url.includes('/issues/7/comments') && (init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify([{ id: 99, body: `${marker}\nold text`, html_url: '' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      const match = url.match(/\/issues\/comments\/(\d+)/)
      if (match && init?.method === 'PATCH') {
        updatedId = Number(match[1])
        const body = JSON.parse(init.body as string) as { body: string }
        return new Response(JSON.stringify({ id: 99, body: body.body, html_url: '' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response('no', { status: 404 })
    })

    const client = new GitHubClient({ token: 't', fetchImpl })
    const result = await upsertMarkedComment(client, 'o', 'r', 7, 'run-42', 'new text')

    expect(updatedId).toBe(99)
    expect(result.body).toContain('new text')
  })
})
