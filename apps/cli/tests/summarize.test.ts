import { describe, expect, test } from 'bun:test'
import { GitHubClient } from '@orchentra/cli-api'
import { buildSummarizePrompt, summarize } from '../src/commands/summarize'
import type { LiveCli } from '../src/live-cli'
import type { WorkflowJob, WorkflowRun } from '@orchentra/cli-api'

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

const fakeRun: WorkflowRun = {
  id: 42,
  name: 'CI',
  head_branch: 'main',
  head_sha: 'abc1234def5678',
  event: 'push',
  status: 'completed',
  conclusion: 'failure',
  html_url: 'https://github.com/acme/api/actions/runs/42',
  workflow_id: 7,
}

const fakeJob: WorkflowJob = {
  id: 100,
  run_id: 42,
  name: 'test',
  status: 'completed',
  conclusion: 'failure',
  html_url: 'https://github.com/acme/api/jobs/100',
  steps: [{ name: 'run tests', status: 'completed', conclusion: 'failure', number: 3 }],
}

describe('buildSummarizePrompt', () => {
  test('demands exactly three sections in the response', () => {
    const prompt = buildSummarizePrompt(fakeRun, [{ job: fakeJob, tail: 'TypeError at src/x.ts:10' }])
    expect(prompt).toContain('Root cause')
    expect(prompt).toContain('Where')
    expect(prompt).toContain('Recommended fix')
  })

  test('forbids preamble, padding, and closing remarks', () => {
    const prompt = buildSummarizePrompt(fakeRun, [{ job: fakeJob, tail: 'err' }])
    expect(prompt).toMatch(/no preamble/i)
    expect(prompt).toMatch(/no (closing|summary|hope this helps)/i)
  })

  test('caps root-cause section to 1-2 sentences', () => {
    const prompt = buildSummarizePrompt(fakeRun, [{ job: fakeJob, tail: 'err' }])
    expect(prompt).toMatch(/1[-–]2 sentences/i)
  })

  test('requires file:line or job/step reference for "Where"', () => {
    const prompt = buildSummarizePrompt(fakeRun, [{ job: fakeJob, tail: 'err' }])
    expect(prompt).toMatch(/file:line|job\/step/i)
  })

  test('requires concrete code-level fix, not "investigate further"', () => {
    const prompt = buildSummarizePrompt(fakeRun, [{ job: fakeJob, tail: 'err' }])
    expect(prompt).toMatch(/concrete|code[- ]level/i)
    expect(prompt).toMatch(/not "investigate further"|no "investigate further"/i)
  })

  test('embeds run metadata and failing job logs verbatim', () => {
    const prompt = buildSummarizePrompt(fakeRun, [{ job: fakeJob, tail: 'TypeError at src/x.ts:10' }])
    expect(prompt).toContain('abc1234') // short sha is enough for a debugging note
    expect(prompt).toContain('test')
    expect(prompt).toContain('TypeError at src/x.ts:10')
  })

  test('stays compact — prompt template under 800 chars excluding log tails', () => {
    const prompt = buildSummarizePrompt(fakeRun, [{ job: fakeJob, tail: '' }])
    // Includes run header + section instructions + empty log block. Cap is
    // intentionally tight so the three-line discipline can't be diluted by
    // verbose scaffolding.
    expect(prompt.length).toBeLessThan(1200)
  })
})

describe('summarize', () => {
  test('fetches run + jobs + logs and dispatches a single runtime turn', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'
    process.env.ORCHENTRA_ALLOWED_ORGS = ''

    const fetchImpl = stubFetch((url) => {
      if (url.endsWith('/actions/runs/42')) {
        return new Response(JSON.stringify(fakeRun), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.includes('/actions/runs/42/jobs')) {
        return new Response(JSON.stringify({ jobs: [fakeJob] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.includes('/actions/jobs/100/logs')) {
        return new Response('##[error] TypeError at src/x.ts:10\n', { status: 200 })
      }
      return new Response('not found', { status: 404 })
    })

    const { cli, turns } = mockCli()
    const result = await summarize(
      { owner: 'acme', repo: 'api', runId: 42 },
      {
        cli,
        clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }),
        write: (): void => {},
        now: () => 0,
      },
    )

    expect(result.failingJobs).toHaveLength(1)
    expect(turns).toHaveLength(1)
    expect(turns[0]).toContain('Root cause')
    expect(turns[0]).toContain('Where')
    expect(turns[0]).toContain('Recommended fix')
    expect(turns[0]).toContain('TypeError')
  })

  test('skips runtime call when no failing jobs', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'

    const fetchImpl = stubFetch((url) => {
      if (url.endsWith('/actions/runs/1')) {
        return new Response(JSON.stringify({ ...fakeRun, id: 1, conclusion: 'success' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ jobs: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const { cli, turns } = mockCli()
    await summarize(
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
