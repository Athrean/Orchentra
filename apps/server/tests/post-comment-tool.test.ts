import { describe, test, expect, mock, beforeEach } from 'bun:test'

let commentsEnabled = true
let createCommentResult: Record<string, unknown> = { id: 1, html_url: '' }
let createCommentBody: string | null = null
let createCommentArgs: Record<string, unknown> | null = null
let apiError: Error | null = null

mock.module('../src/config', () => ({
  config: {
    github: {
      token: 'ghp_test',
      webhook_secret: 'test',
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

mock.module('@octokit/rest', () => ({
  Octokit: class {
    issues = {
      createComment: async (opts: { owner: string; repo: string; issue_number: number; body: string }) => {
        createCommentArgs = { ...opts }
        createCommentBody = opts.body
        if (apiError) throw apiError
        return { data: createCommentResult }
      },
    }
  },
}))

const { postCommentTool } = await import('../src/agent/tools/post-comment')

const ctx = { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal }

beforeEach(() => {
  commentsEnabled = true
  createCommentResult = {
    id: 99,
    html_url: 'https://github.com/my-org/api/pull/42#issuecomment-99',
  }
  createCommentBody = null
  createCommentArgs = null
  apiError = null
})

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
    expect(createCommentArgs).toMatchObject({ owner: 'my-org', repo: 'api', issue_number: 42 })
  })

  test('prefixes body with kind header', async () => {
    await postCommentTool.execute(
      { owner: 'my-org', repo: 'api', prNumber: 1, body: 'Found a flaky test.', kind: 'note' },
      ctx,
    )

    expect(createCommentBody).toContain('## Orchentra Triage Note')
    expect(createCommentBody).toContain('Found a flaky test.')
  })

  test('uses correct header per kind', async () => {
    await postCommentTool.execute(
      { owner: 'my-org', repo: 'api', prNumber: 1, body: 'final summary', kind: 'final' },
      ctx,
    )
    expect(createCommentBody).toContain('## Orchentra Triage Results')

    await postCommentTool.execute(
      { owner: 'my-org', repo: 'api', prNumber: 1, body: 'progress update', kind: 'progress' },
      ctx,
    )
    expect(createCommentBody).toContain('## Orchentra Triage Update')
  })

  test('returns error when comments_enabled is false (no API call)', async () => {
    commentsEnabled = false

    const result = await postCommentTool.execute(
      { owner: 'my-org', repo: 'api', prNumber: 42, body: 'hi', kind: 'note' },
      ctx,
    )

    expect(result).toHaveProperty('error')
    expect(result.error).toContain('disabled')
    expect(createCommentArgs).toBeNull()
  })

  test('rejects unmonitored repos', async () => {
    const result = await postCommentTool.execute(
      { owner: 'evil', repo: 'corp', prNumber: 1, body: 'hi', kind: 'note' },
      ctx,
    )

    expect(result).toHaveProperty('error')
    expect(result.error).toContain('not monitored')
    expect(createCommentArgs).toBeNull()
  })

  test('returns error on API failure', async () => {
    apiError = new Error('GitHub API rate limit')

    const result = await postCommentTool.execute(
      { owner: 'my-org', repo: 'api', prNumber: 42, body: 'hi', kind: 'note' },
      ctx,
    )

    expect(result).toHaveProperty('error')
    expect(result.error).toContain('Failed to post comment')
    expect(result.error).toContain('rate limit')
  })

  test('body is capped at 6000 chars', async () => {
    await postCommentTool.execute(
      { owner: 'my-org', repo: 'api', prNumber: 1, body: 'x'.repeat(10_000), kind: 'note' },
      ctx,
    )

    expect(createCommentBody).not.toBeNull()
    const xCount = (createCommentBody as string).match(/x/g)?.length ?? 0
    expect(xCount).toBeLessThanOrEqual(6000)
  })
})
