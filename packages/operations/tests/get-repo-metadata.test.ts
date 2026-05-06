import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { getRepoMetadataOperation } from '../src/ops/github/get-repo-metadata'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface ReposOverride {
  get?: GithubAdapter['repos']['get']
  listLanguages?: GithubAdapter['repos']['listLanguages']
  getAllTopics?: GithubAdapter['repos']['getAllTopics']
}

function fakeAdapter(repos: ReposOverride = {}): GithubAdapter {
  return {
    pulls: {
      get: () => Promise.reject(new Error('not used')),
      list: () => Promise.reject(new Error('not used')),
      listFiles: () => Promise.reject(new Error('not used')),
      listReviewComments: () => Promise.reject(new Error('not used')),
    },
    issues: {
      get: () => Promise.reject(new Error('not used')),
      list: () => Promise.reject(new Error('not used')),
      listComments: () => Promise.reject(new Error('not used')),
    },
    repos: {
      get:
        repos.get ??
        (() =>
          Promise.resolve({
            data: {
              name: 'api',
              full_name: 'my-org/api',
              default_branch: 'main',
              language: 'TypeScript',
              private: true,
              archived: false,
              pushed_at: '2026-04-15T10:00:00Z',
              size: 5120,
              stargazers_count: 42,
              open_issues_count: 7,
            },
          })),
      getCommit: () => Promise.reject(new Error('not used')),
      getContent: () => Promise.reject(new Error('not used')),
      listBranches: () => Promise.reject(new Error('not used')),
      listLanguages: repos.listLanguages ?? (() => Promise.resolve({ data: { TypeScript: 100000, JavaScript: 5000 } })),
      getAllTopics: repos.getAllTopics ?? (() => Promise.resolve({ data: { names: ['devops', 'mcp'] } })),
    },
    checks: {
      listForRef: () => Promise.reject(new Error('not used')),
    },
    actions: {
      listWorkflowRunArtifacts: () => Promise.reject(new Error('not used')),
      downloadArtifact: () => Promise.reject(new Error('not used')),
    },
    search: {
      code: () => Promise.reject(new Error('not used')),
    },
  }
}

describe('get_repo_metadata operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns merged repo + languages + topics shape', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await getRepoMetadataOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
    })) as {
      name: string
      fullName: string
      defaultBranch: string
      language: string | null
      languages: Record<string, number>
      topics: string[]
      private: boolean
      archived: boolean
      pushedAt: string | null
      size: number
      stargazersCount: number
      openIssuesCount: number
    }

    expect(result.name).toBe('api')
    expect(result.fullName).toBe('my-org/api')
    expect(result.defaultBranch).toBe('main')
    expect(result.language).toBe('TypeScript')
    expect(result.languages).toEqual({ TypeScript: 100000, JavaScript: 5000 })
    expect(result.topics).toEqual(['devops', 'mcp'])
    expect(result.private).toBe(true)
    expect(result.archived).toBe(false)
    expect(result.pushedAt).toBe('2026-04-15T10:00:00Z')
    expect(result.size).toBe(5120)
    expect(result.stargazersCount).toBe(42)
    expect(result.openIssuesCount).toBe(7)
  })

  test('handler tolerates empty topics + nullable language', async () => {
    setGithubAdapter(
      fakeAdapter({
        get: () =>
          Promise.resolve({
            data: {
              name: 'empty',
              full_name: 'my-org/api',
              default_branch: 'main',
              language: null,
              private: false,
              archived: true,
              pushed_at: null,
              size: 0,
              stargazers_count: 0,
              open_issues_count: 0,
            },
          }),
        listLanguages: () => Promise.resolve({ data: {} }),
        getAllTopics: () => Promise.resolve({ data: { names: [] } }),
      }),
    )

    const result = (await getRepoMetadataOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
    })) as { language: string | null; pushedAt: string | null; topics: string[]; archived: boolean }

    expect(result.language).toBeNull()
    expect(result.pushedAt).toBeNull()
    expect(result.topics).toEqual([])
    expect(result.archived).toBe(true)
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await getRepoMetadataOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error when any underlying call throws', async () => {
    setGithubAdapter(fakeAdapter({ get: () => Promise.reject(new Error('Not Found')) }))

    const result = (await getRepoMetadataOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
    })) as { error: string }

    expect(result.error).toContain('Failed to fetch repo metadata')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(getRepoMetadataOperation, localCtx, { owner: 'my-org' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(getRepoMetadataOperation.id).toBe('get_repo_metadata')
    expect(getRepoMetadataOperation.scope).toBe('read')
    expect(getRepoMetadataOperation.mutating).toBe(false)
    expect(getRepoMetadataOperation.localOnly).toBe(false)
  })
})
