import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { getCommitChangesOperation } from '../src/ops/github/get-commit-changes'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

function fakeAdapter(overrides: Partial<GithubAdapter['repos']> = {}): GithubAdapter {
  return {
    pulls: {
      get: () => Promise.reject(new Error('not used')),
      listFiles: () => Promise.reject(new Error('not used')),
      listReviewComments: () => Promise.reject(new Error('not used')),
    },
    issues: {
      get: () => Promise.reject(new Error('not used')),
      listComments: () => Promise.reject(new Error('not used')),
    },
    repos: {
      getCommit: () =>
        Promise.resolve({
          data: {
            sha: 'abc1234',
            commit: { message: 'fix: handle null user', author: { name: 'Dev' } },
            files: [
              {
                filename: 'src/auth.ts',
                status: 'modified',
                additions: 4,
                deletions: 1,
                patch: '@@ -1,3 +1,4 @@\n+null check',
              },
            ],
          },
        }),
      getContent: () => Promise.reject(new Error('not used')),
      ...overrides,
    },
    search: {
      code: () => Promise.reject(new Error('not used')),
    },
  }
}

describe('get_commit_changes operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns parsed commit + files for a monitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await getCommitChangesOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      sha: 'abc1234',
    })) as {
      sha: string
      message: string
      author: string
      files: Array<{ filename: string; status: string }>
      totalChangedFiles: number
    }

    expect(result.sha).toBe('abc1234')
    expect(result.message).toBe('fix: handle null user')
    expect(result.author).toBe('Dev')
    expect(result.files).toHaveLength(1)
    expect(result.files[0].filename).toBe('src/auth.ts')
    expect(result.totalChangedFiles).toBe(1)
  })

  test('handler returns error object when repo is not monitored', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await getCommitChangesOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      sha: 'abc',
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error object when adapter call throws', async () => {
    setGithubAdapter(
      fakeAdapter({
        getCommit: () => Promise.reject(new Error('Not Found')),
      }),
    )

    const result = (await getCommitChangesOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      sha: 'deadbeef',
    })) as { error: string }

    expect(result.error).toContain('Failed to fetch commit')
    expect(result.error).toContain('Not Found')
  })

  test('flags totalChangedFilesTruncated when GitHub returns the page cap (300)', async () => {
    const bigFiles = Array.from({ length: 300 }, (_, i) => ({
      filename: `f${i}.ts`,
      status: 'modified',
      additions: 1,
      deletions: 0,
    }))
    setGithubAdapter(
      fakeAdapter({
        getCommit: () =>
          Promise.resolve({
            data: { sha: 's', commit: { message: 'big', author: { name: 'D' } }, files: bigFiles },
          }),
      }),
    )
    const result = (await getCommitChangesOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      sha: 's',
    })) as { totalChangedFiles: number; totalChangedFilesTruncated: boolean }
    expect(result.totalChangedFiles).toBe(300)
    expect(result.totalChangedFilesTruncated).toBe(true)
  })

  test('does not flag truncated for normal-sized commits', async () => {
    setGithubAdapter(fakeAdapter())
    const result = (await getCommitChangesOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      sha: 'abc1234',
    })) as { totalChangedFilesTruncated: boolean }
    expect(result.totalChangedFilesTruncated).toBe(false)
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(getCommitChangesOperation, localCtx, { owner: 'my-org', repo: 'api' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(getCommitChangesOperation.id).toBe('get_commit_changes')
    expect(getCommitChangesOperation.scope).toBe('read')
    expect(getCommitChangesOperation.mutating).toBe(false)
    expect(getCommitChangesOperation.localOnly).toBe(false)
  })
})
