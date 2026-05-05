import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { spawnFakeGitHub } from './fakes/github-server'
import { makeFakeOctokit } from './helpers/fake-octokit'

let commentsEnabled = true

const fake = await spawnFakeGitHub()

mock.module('../src/config', () => ({
  config: {
    github: {
      token: 'ghp_test',
      webhook_secret: 'test',
      api_base_url: fake.baseUrl,
      repos: ['my-org/api'],
      get comments_enabled(): boolean {
        return commentsEnabled
      },
    },
  },
}))

const monitoredSet = new Set(['my-org/api'])
mock.module('../src/lib/repo-cache', () => ({
  isRepoMonitored: async (fullName: string) => monitoredSet.has(fullName.toLowerCase()),
  getMonitoredRepos: async () => monitoredSet,
  invalidateMonitoredReposCache: () => {},
}))

const { setOctokitForTesting } = await import('../src/github/octokit')
const { postCommentTool } = await import('../src/agent/tools/post-comment')

setOctokitForTesting(makeFakeOctokit(fake.baseUrl) as never)

afterAll(async () => {
  await fake.shutdown()
})

const ctx = { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal }

const happyPath = {
  routes: {
    'POST /repos/:owner/:repo/issues/:issue_number/comments': (c: { json: (v: unknown) => Response }) =>
      c.json({ id: 99, html_url: 'https://github.com/my-org/api/pull/42#issuecomment-99' }) as never,
  },
}

beforeEach(() => {
  commentsEnabled = true
  fake.requests.length = 0
  fake.setScenario(happyPath as never)
})

const lastCommentBody = (): string | null => {
  const r = [...fake.requests].reverse().find((req) => req.method === 'POST' && req.path.endsWith('/comments'))
  return r ? ((r.body as { body?: string }).body ?? null) : null
}

describe('postCommentTool', () => {
  test('posts comment and returns commentId + commentUrl', async () => {
    const result = await postCommentTool.execute(
      { owner: 'my-org', repo: 'api', prNumber: 42, body: 'Investigation in progress.', kind: 'progress' },
      ctx,
    )

    expect(result).toEqual({
      commentId: 99,
      commentUrl: 'https://github.com/my-org/api/pull/42#issuecomment-99',
    })
    const req = fake.requests.find((r) => r.method === 'POST')
    expect(req?.path).toBe('/repos/my-org/api/issues/42/comments')
  })

  test('prefixes body with kind header', async () => {
    await postCommentTool.execute(
      { owner: 'my-org', repo: 'api', prNumber: 1, body: 'Found a flaky test.', kind: 'note' },
      ctx,
    )

    const body = lastCommentBody()
    expect(body).toContain('## Orchentra Triage Note')
    expect(body).toContain('Found a flaky test.')
  })

  test('uses correct header per kind', async () => {
    await postCommentTool.execute(
      { owner: 'my-org', repo: 'api', prNumber: 1, body: 'final summary', kind: 'final' },
      ctx,
    )
    expect(lastCommentBody()).toContain('## Orchentra Triage Results')

    await postCommentTool.execute(
      { owner: 'my-org', repo: 'api', prNumber: 1, body: 'progress update', kind: 'progress' },
      ctx,
    )
    expect(lastCommentBody()).toContain('## Orchentra Triage Update')
  })

  test('returns error when comments_enabled is false (no API call)', async () => {
    commentsEnabled = false

    const result = await postCommentTool.execute(
      { owner: 'my-org', repo: 'api', prNumber: 42, body: 'hi', kind: 'note' },
      ctx,
    )

    expect(result).toHaveProperty('error')
    expect(result.error).toContain('disabled')
    expect(fake.requests.filter((r) => r.method === 'POST')).toHaveLength(0)
  })

  test('rejects unmonitored repos', async () => {
    const result = await postCommentTool.execute(
      { owner: 'evil', repo: 'corp', prNumber: 1, body: 'hi', kind: 'note' },
      ctx,
    )

    expect(result).toHaveProperty('error')
    expect(result.error).toContain('not monitored')
    expect(fake.requests.filter((r) => r.method === 'POST')).toHaveLength(0)
  })

  test('returns error on API failure', async () => {
    fake.setScenario({
      routes: {
        'POST /repos/:owner/:repo/issues/:issue_number/comments': (c) =>
          c.json({ message: 'GitHub API rate limit' }, 429),
      },
    })

    const result = await postCommentTool.execute(
      { owner: 'my-org', repo: 'api', prNumber: 42, body: 'hi', kind: 'note' },
      ctx,
    )

    expect(result).toHaveProperty('error')
    expect(result.error).toContain('Failed to post comment')
  })

  test('rejects body longer than 6000 chars at the schema boundary', async () => {
    let caught: unknown
    try {
      await postCommentTool.execute(
        { owner: 'my-org', repo: 'api', prNumber: 1, body: 'x'.repeat(10_000), kind: 'note' },
        ctx,
      )
    } catch (err) {
      caught = err
    }

    expect(caught).toBeDefined()
    expect(fake.requests.filter((r) => r.method === 'POST')).toHaveLength(0)
  })

  test('accepts a 6000-char body and forwards it unchanged', async () => {
    await postCommentTool.execute(
      { owner: 'my-org', repo: 'api', prNumber: 1, body: 'x'.repeat(6000), kind: 'note' },
      ctx,
    )

    const body = lastCommentBody()
    expect(body).not.toBeNull()
    const xCount = (body as string).match(/x/g)?.length ?? 0
    expect(xCount).toBe(6000)
  })
})
