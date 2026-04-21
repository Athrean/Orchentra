import { describe, expect, test } from 'bun:test'
import { GitHubClient } from '@orchentra/cli-api'
import { investigate } from '../src/commands/investigate'
import type { LiveCli } from '../src/live-cli'

function stubFetch(handler: (url: string) => Response): typeof fetch {
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    return handler(url)
  }) as typeof fetch
}

function mockCli(): { cli: LiveCli; turns: string[] } {
  const turns: string[] = []
  const cli = {
    runTurn: async (prompt: string): Promise<void> => {
      turns.push(prompt)
    },
  } as unknown as LiveCli
  return { cli, turns }
}

describe('investigate', () => {
  test('orchestrates run → jobs → logs → runtime turn', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'
    process.env.ORCHENTRA_ALLOWED_ORGS = ''

    const fetchImpl = stubFetch((url) => {
      if (url.endsWith('/actions/runs/42')) {
        return new Response(
          JSON.stringify({
            id: 42,
            name: 'CI',
            head_branch: 'main',
            head_sha: 'abc1234def',
            event: 'push',
            status: 'completed',
            conclusion: 'failure',
            html_url: 'https://github.com/acme/api/actions/runs/42',
            workflow_id: 7,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.includes('/actions/runs/42/jobs')) {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 100,
                run_id: 42,
                name: 'test',
                status: 'completed',
                conclusion: 'failure',
                html_url: 'https://github.com/acme/api/jobs/100',
                steps: [{ name: 'run tests', status: 'completed', conclusion: 'failure', number: 3 }],
              },
              {
                id: 101,
                run_id: 42,
                name: 'lint',
                status: 'completed',
                conclusion: 'success',
                html_url: 'https://github.com/acme/api/jobs/101',
                steps: [],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.includes('/actions/jobs/100/logs')) {
        return new Response('##[error] TypeError at src/x.ts:10\n', { status: 200 })
      }
      return new Response('not found', { status: 404 })
    })

    const { cli, turns } = mockCli()

    const result = await investigate(
      { owner: 'acme', repo: 'api', runId: 42 },
      {
        cli,
        clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }),
        write: (): void => {},
        now: () => 0,
      },
    )

    expect(result.failingJobs).toHaveLength(1)
    expect(result.failingJobs[0].name).toBe('test')
    expect(turns).toHaveLength(1)
    expect(turns[0]).toContain('TypeError')
    expect(turns[0]).toContain('Workflow run: CI')
  })

  test('skips runtime call when no failing jobs', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'

    const fetchImpl = stubFetch((url) => {
      if (url.endsWith('/actions/runs/1')) {
        return new Response(
          JSON.stringify({
            id: 1,
            name: 'CI',
            head_branch: 'main',
            head_sha: 'x',
            event: 'push',
            status: 'completed',
            conclusion: 'success',
            html_url: '',
            workflow_id: 1,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(JSON.stringify({ jobs: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const { cli, turns } = mockCli()
    await investigate(
      { owner: 'acme', repo: 'api', runId: 1 },
      {
        cli,
        clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }),
        write: (): void => {},
      },
    )
    expect(turns).toHaveLength(0)
  })
})
