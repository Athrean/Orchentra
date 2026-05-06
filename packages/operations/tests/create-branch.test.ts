import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { createBranchOperation } from '../src/ops/github/create-branch'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface GitOverride {
  createRef?: GithubAdapter['git']['createRef']
}

function fakeAdapter(git: GitOverride = {}): GithubAdapter {
  const defaultCreateRef: GithubAdapter['git']['createRef'] = () =>
    Promise.resolve({
      data: {
        ref: 'refs/heads/feat/my-branch',
        url: 'https://api.github.com/repos/my-org/api/git/refs/heads/feat/my-branch',
        object: { sha: 'abc1234', type: 'commit', url: 'https://api.github.com/repos/my-org/api/commits/abc1234' },
      },
    })

  return {
    pulls: {
      get: () => Promise.reject(new Error('not used')),
      list: () => Promise.reject(new Error('not used')),
      listFiles: () => Promise.reject(new Error('not used')),
      listReviewComments: () => Promise.reject(new Error('not used')),
      merge: () => Promise.reject(new Error('not used')),
    },
    issues: {
      get: () => Promise.reject(new Error('not used')),
      list: () => Promise.reject(new Error('not used')),
      listComments: () => Promise.reject(new Error('not used')),
    },
    repos: {
      get: () => Promise.reject(new Error('not used')),
      getCommit: () => Promise.reject(new Error('not used')),
      getContent: () => Promise.reject(new Error('not used')),
      listBranches: () => Promise.reject(new Error('not used')),
      listLanguages: () => Promise.reject(new Error('not used')),
      getAllTopics: () => Promise.reject(new Error('not used')),
      createOrUpdateFileContents: () => Promise.reject(new Error('not used')),
    },
    git: {
      createRef: git.createRef ?? defaultCreateRef,
    },
    checks: {
      listForRef: () => Promise.reject(new Error('not used')),
    },
    actions: {
      listWorkflowRunsForRepo: () => Promise.reject(new Error('not used')),
      getWorkflowRun: () => Promise.reject(new Error('not used')),
      listJobsForWorkflowRun: () => Promise.reject(new Error('not used')),
      downloadJobLogsForWorkflowRun: () => Promise.reject(new Error('not used')),
      listWorkflowRunArtifacts: () => Promise.reject(new Error('not used')),
      downloadArtifact: () => Promise.reject(new Error('not used')),
    },
    search: {
      code: () => Promise.reject(new Error('not used')),
    },
  }
}

describe('create_branch operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns ref and sha on success', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await createBranchOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      branch: 'feat/my-branch',
      sha: 'abc1234',
    })) as { ref: string; sha: string }

    expect(result.ref).toBe('refs/heads/feat/my-branch')
    expect(result.sha).toBe('abc1234')
  })

  test('handler submits branch name as refs/heads/<branch> to adapter', async () => {
    let captured: Parameters<GithubAdapter['git']['createRef']>[0] | undefined
    setGithubAdapter(
      fakeAdapter({
        createRef: (p) => {
          captured = p
          return Promise.resolve({
            data: {
              ref: p.ref,
              url: '',
              object: { sha: p.sha, type: 'commit', url: '' },
            },
          })
        },
      }),
    )

    await createBranchOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      branch: 'hotfix/login',
      sha: 'deadbeef',
    })

    expect(captured?.ref).toBe('refs/heads/hotfix/login')
    expect(captured?.sha).toBe('deadbeef')
    expect(captured?.owner).toBe('my-org')
    expect(captured?.repo).toBe('api')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter({ createRef: () => Promise.reject(new Error('branch already exists')) }))

    const result = (await createBranchOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      branch: 'main',
      sha: 'abc1234',
    })) as { error: string }

    expect(result.error).toContain('Failed to create branch')
    expect(result.error).toContain('branch already exists')
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await createBranchOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      branch: 'feat/attack',
      sha: 'abc1234',
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('dispatch rejects missing required fields with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(createBranchOperation, localCtx, {
        owner: 'my-org',
        repo: 'api',
        // missing branch and sha
      })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is write-scoped, mutating, non-localOnly, trustClass write', () => {
    expect(createBranchOperation.id).toBe('create_branch')
    expect(createBranchOperation.scope).toBe('write')
    expect(createBranchOperation.trustClass).toBe('write')
    expect(createBranchOperation.mutating).toBe(true)
    expect(createBranchOperation.localOnly).toBe(false)
  })
})
