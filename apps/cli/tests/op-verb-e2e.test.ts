import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { spawnFakeGitHubForMcpTest, type FakeGitHubHandle } from './fixtures/fake-github-server'

const CLI_ENTRY = resolve(import.meta.dir, '..', 'src', 'main.ts')

let fake: FakeGitHubHandle

beforeAll(async () => {
  fake = await spawnFakeGitHubForMcpTest()
})
afterAll(async () => {
  await fake.shutdown()
})

interface SpawnResult {
  exitCode: number
  stdout: string
  stderr: string
}

async function runVerb(args: string[]): Promise<SpawnResult> {
  const proc = Bun.spawn({
    cmd: ['bun', CLI_ENTRY, ...args],
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      ORCHENTRA_MCP_FAKE_GH_BASE: fake.baseUrl,
      ORCHENTRA_ALLOWED_REPOS: 'my-org/api',
    },
  })
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  const exitCode = await proc.exited
  return { exitCode, stdout, stderr }
}

describe('orchentra get_pull_request (shell verb e2e)', () => {
  test('exits 0 and prints PR title for a valid invocation', async () => {
    fake.setScenario({
      pulls: {
        'my-org/api#7': {
          title: 'Add login flow',
          body: null,
          state: 'open',
          merged: false,
          user: { login: 'alice' },
          base: { ref: 'main' },
          head: { ref: 'feature/login' },
          created_at: '2026-04-01T10:00:00Z',
        },
      },
      pullFiles: { 'my-org/api#7': [] },
      pullReviewComments: { 'my-org/api#7': [] },
    })

    const result = await runVerb(['get_pull_request', '--owner', 'my-org', '--repo', 'api', '--number', '7'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Add login flow')
  })

  test('exits 1 with friendly error when --number missing', async () => {
    const result = await runVerb(['get_pull_request', '--owner', 'my-org', '--repo', 'api'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toLowerCase()).toContain('number')
  })

  // One subprocess test per op family — covers the auto-registration path
  // for every shape (read, list, search, etc.) without burning 36 spawns.
  test('Issues family: get_issue resolves through the same factory', async () => {
    fake.setScenario({
      issues: {
        'my-org/api#42': {
          title: 'Login is broken',
          body: 'Reproduces on main',
          state: 'open',
          labels: [{ name: 'bug' }],
          user: { login: 'alice' },
          created_at: '2026-04-02T10:00:00Z',
        },
      },
      issueComments: { 'my-org/api#42': [] },
    })
    const result = await runVerb(['get_issue', '--owner', 'my-org', '--repo', 'api', '--number', '42'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Login is broken')
  })

  test('Repos family: get_file_content resolves through the same factory', async () => {
    fake.setScenario({
      contents: {
        'my-org/api#README.md': {
          type: 'file',
          path: 'README.md',
          content: Buffer.from('hello world').toString('base64'),
          size: 11,
          encoding: 'base64',
        },
      },
    })
    const result = await runVerb(['get_file_content', '--owner', 'my-org', '--repo', 'api', '--path', 'README.md'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('hello world')
  })
})
