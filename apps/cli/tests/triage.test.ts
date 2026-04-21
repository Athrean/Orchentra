import { describe, expect, test } from 'bun:test'
import { GitHubClient } from '@orchentra/cli-api'
import { triage } from '../src/commands/triage'

function runStub(): Response {
  return new Response(
    JSON.stringify({
      id: 42,
      name: 'CI',
      head_branch: 'main',
      head_sha: 'sha-head',
      event: 'push',
      status: 'completed',
      conclusion: 'failure',
      html_url: 'https://github.com/o/r/actions/runs/42',
      workflow_id: 1,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function jobsStub(): Response {
  return new Response(
    JSON.stringify({
      jobs: [
        {
          id: 100,
          run_id: 42,
          name: 'test',
          status: 'completed',
          conclusion: 'failure',
          html_url: 'https://github.com/o/r/jobs/100',
          steps: [{ name: 'run', status: 'completed', conclusion: 'failure', number: 1 }],
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function routeTriageFetch(existing: { checkRuns: unknown[]; comments: unknown[] }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    const json = (data: unknown, status = 200): Response =>
      new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

    if (url.endsWith('/actions/runs/42')) return runStub()
    if (url.includes('/actions/runs/42/jobs')) return jobsStub()
    if (url.includes('/actions/jobs/100/logs')) return new Response('##[error] boom', { status: 200 })
    if (url.includes('/statuses/'))
      return json({ id: 1, state: 'failure', context: 'orchentra/triage', description: '', target_url: null })
    if (url.includes('/check-runs') && method === 'GET') return json({ check_runs: existing.checkRuns })
    if (url.includes('/check-runs/') && method === 'PATCH') {
      const body = JSON.parse(init?.body as string) as Record<string, unknown>
      return json({
        id: 500,
        status: 'completed',
        conclusion: body.conclusion,
        name: body.name,
        external_id: body.external_id,
        head_sha: 'sha-head',
        html_url: '',
      })
    }
    if (url.includes('/check-runs') && method === 'POST')
      return json(
        {
          id: 500,
          status: 'completed',
          conclusion: 'failure',
          name: 'x',
          external_id: 'orchentra-triage-42',
          head_sha: 'sha-head',
          html_url: '',
        },
        201,
      )
    if (url.includes('/commits/sha-head/pulls'))
      return json([
        {
          number: 9,
          title: 't',
          state: 'open',
          html_url: 'https://github.com/o/r/pull/9',
          head: { ref: 'feat', sha: 'sha-head' },
          base: { ref: 'main', sha: 'sha-base' },
        },
      ])
    if (url.includes('/issues/9/comments') && method === 'GET') return json(existing.comments)
    if (url.includes('/issues/comments/') && method === 'PATCH') {
      const body = JSON.parse(init?.body as string) as { body: string }
      return json({ id: 9001, body: body.body, html_url: '' })
    }
    if (url.includes('/issues/9/comments') && method === 'POST') {
      const body = JSON.parse(init?.body as string) as { body: string }
      return json({ id: 9002, body: body.body, html_url: '' }, 201)
    }
    return new Response('no route', { status: 404 })
  }) as typeof fetch
}

describe('triage', () => {
  test('posts commit status, creates check, creates PR comment on first run', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'
    const fetchImpl = routeTriageFetch({ checkRuns: [], comments: [] })

    const result = await triage(
      { owner: 'o', repo: 'r', runId: 42 },
      { clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }), write: () => {} },
    )

    expect(result.status.state).toBe('failure')
    expect(result.check.id).toBe(500)
    expect(result.comment?.id).toBe(9002)
    expect(result.pullRequest?.number).toBe(9)
  })

  test('re-running finds existing check + comment and updates them', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'
    const fetchImpl = routeTriageFetch({
      checkRuns: [
        {
          id: 500,
          name: 'Orchentra Triage',
          external_id: 'orchentra-triage-42',
          head_sha: 'sha-head',
          html_url: '',
          status: 'completed',
          conclusion: 'failure',
        },
      ],
      comments: [
        {
          id: 9001,
          body: '<!-- orchentra:triage:run-42 -->\nold body',
          html_url: '',
        },
      ],
    })

    const result = await triage(
      { owner: 'o', repo: 'r', runId: 42 },
      { clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }), write: () => {} },
    )

    expect(result.comment?.id).toBe(9001)
  })
})
