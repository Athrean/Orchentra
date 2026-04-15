import { describe, test, expect, mock, beforeEach } from 'bun:test'

let pullsGetResult: Record<string, unknown> = {}
let pullsListFilesResult: Record<string, unknown>[] = []
let prReviewCommentsResult: Record<string, unknown>[] = []
let issuesGetResult: Record<string, unknown> = {}
let issueCommentsResult: Record<string, unknown>[] = []
let searchCodeResult: { total_count: number; items: Record<string, unknown>[] } = { total_count: 0, items: [] }
let searchCodeQuery: string | null = null
let apiError: Error | null = null

mock.module('../src/config', () => ({
  config: {
    github: {
      token: 'ghp_test',
      webhook_secret: 'test',
      repos: ['my-org/api'],
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
    pulls = {
      get: async () => {
        if (apiError) throw apiError
        return { data: pullsGetResult }
      },
      listFiles: async () => {
        return { data: pullsListFilesResult }
      },
      listReviewComments: async () => {
        return { data: prReviewCommentsResult }
      },
    }
    issues = {
      get: async () => {
        if (apiError) throw apiError
        return { data: issuesGetResult }
      },
      listComments: async () => {
        return { data: issueCommentsResult }
      },
    }
    search = {
      code: async (opts: { q: string }) => {
        searchCodeQuery = opts.q
        if (apiError) throw apiError
        return { data: searchCodeResult }
      },
    }
  },
}))

const { getPullRequestTool, getIssueTool, searchCodeTool } = await import('../src/agent/tools/github-issues')

const ctx = { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal }

beforeEach(() => {
  pullsGetResult = {}
  pullsListFilesResult = []
  prReviewCommentsResult = []
  issuesGetResult = {}
  issueCommentsResult = []
  searchCodeResult = { total_count: 0, items: [] }
  searchCodeQuery = null
  apiError = null
})

describe('getPullRequestTool', () => {
  test('fetches PR details with files and comments', async () => {
    pullsGetResult = {
      title: 'Fix login bug',
      body: 'This PR fixes the login issue',
      state: 'open',
      merged: false,
      user: { login: 'dev1' },
      base: { ref: 'main' },
      head: { ref: 'fix/login' },
      created_at: '2026-04-01T10:00:00Z',
    }
    pullsListFilesResult = [{ filename: 'src/auth.ts', status: 'modified', additions: 5, deletions: 2 }]
    prReviewCommentsResult = [{ user: { login: 'reviewer1' }, body: 'LGTM' }]

    const result = await getPullRequestTool.execute({ owner: 'my-org', repo: 'api', number: 42 }, ctx)

    expect(result.title).toBe('Fix login bug')
    expect(result.files).toHaveLength(1)
    expect(result.files[0].filename).toBe('src/auth.ts')
    expect(result.comments).toHaveLength(1)
    expect(result.comments[0].user).toBe('reviewer1')
  })

  test('truncates long body', async () => {
    pullsGetResult = {
      title: 'Big PR',
      body: 'x'.repeat(5000),
      state: 'open',
      merged: false,
      user: { login: 'dev' },
      base: { ref: 'main' },
      head: { ref: 'feature' },
      created_at: '2026-04-01T10:00:00Z',
    }
    pullsListFilesResult = []
    prReviewCommentsResult = []

    const result = await getPullRequestTool.execute({ owner: 'my-org', repo: 'api', number: 1 }, ctx)

    expect((result.body as string).length).toBeLessThanOrEqual(3000)
  })

  test('rejects unmonitored repos', async () => {
    const result = await getPullRequestTool.execute({ owner: 'other-org', repo: 'other-repo', number: 1 }, ctx)
    expect(result).toHaveProperty('error')
    expect(result.error).toContain('not monitored')
  })

  test('returns error on API failure', async () => {
    apiError = new Error('Not Found')
    const result = await getPullRequestTool.execute({ owner: 'my-org', repo: 'api', number: 999 }, ctx)
    expect(result).toHaveProperty('error')
    expect(result.error).toContain('Failed to fetch PR')
  })
})

describe('getIssueTool', () => {
  test('fetches issue details with labels and comments', async () => {
    issuesGetResult = {
      title: 'CI keeps failing on main',
      body: 'The build has been broken since yesterday',
      state: 'open',
      labels: [{ name: 'bug' }, { name: 'ci' }],
      user: { login: 'dev1' },
      created_at: '2026-04-01T10:00:00Z',
    }
    issueCommentsResult = [{ user: { login: 'dev2' }, body: 'Same issue here' }]

    const result = await getIssueTool.execute({ owner: 'my-org', repo: 'api', number: 10 }, ctx)

    expect(result.title).toBe('CI keeps failing on main')
    expect(result.labels).toEqual(['bug', 'ci'])
    expect(result.comments).toHaveLength(1)
  })

  test('handles issues with string labels', async () => {
    issuesGetResult = {
      title: 'Test',
      body: null,
      state: 'open',
      labels: ['bug', 'ci'],
      user: { login: 'dev' },
      created_at: '2026-04-01T10:00:00Z',
    }
    issueCommentsResult = []

    const result = await getIssueTool.execute({ owner: 'my-org', repo: 'api', number: 5 }, ctx)

    expect(result.labels).toEqual(['bug', 'ci'])
  })

  test('rejects unmonitored repos', async () => {
    const result = await getIssueTool.execute({ owner: 'evil', repo: 'corp', number: 1 }, ctx)
    expect(result).toHaveProperty('error')
  })
})

describe('searchCodeTool', () => {
  test('returns matching file paths', async () => {
    searchCodeResult = {
      total_count: 2,
      items: [
        { path: 'src/auth/login.ts', name: 'login.ts' },
        { path: 'tests/auth/login.test.ts', name: 'login.test.ts' },
      ],
    }

    const result = await searchCodeTool.execute({ owner: 'my-org', repo: 'api', query: 'loginHandler' }, ctx)

    expect(result.total).toBe(2)
    expect(result.results).toHaveLength(2)
    expect(result.results[0].path).toBe('src/auth/login.ts')
  })

  test('returns empty results when no matches', async () => {
    searchCodeResult = { total_count: 0, items: [] }

    const result = await searchCodeTool.execute({ owner: 'my-org', repo: 'api', query: 'nonexistent' }, ctx)

    expect(result.total).toBe(0)
    expect(result.results).toHaveLength(0)
  })

  test('rejects unmonitored repos', async () => {
    const result = await searchCodeTool.execute({ owner: 'evil', repo: 'corp', query: 'password' }, ctx)
    expect(result).toHaveProperty('error')
  })

  test('returns error on API failure', async () => {
    apiError = new Error('Search rate limited')
    const result = await searchCodeTool.execute({ owner: 'my-org', repo: 'api', query: 'test' }, ctx)
    expect(result).toHaveProperty('error')
    expect(result.error).toContain('Failed to search code')
  })

  test('strips scope qualifiers from query to prevent cross-repo leakage', async () => {
    searchCodeResult = { total_count: 0, items: [] }

    await searchCodeTool.execute({ owner: 'my-org', repo: 'api', query: 'password repo:other-org/secret-repo' }, ctx)

    expect(searchCodeQuery).toBe('password repo:my-org/api')
  })
})
