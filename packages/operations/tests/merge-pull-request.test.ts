import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { mergePullRequestOperation } from '../src/ops/github/merge-pull-request'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface PullsOverride {
  merge?: GithubAdapter['pulls']['merge']
}

function fakeAdapter(pulls: PullsOverride = {}): GithubAdapter {
  const defaultMerge: GithubAdapter['pulls']['merge'] = () =>
    Promise.resolve({
      data: {
        sha: 'merge-sha-xyz',
        merged: true,
        message: 'Pull Request successfully merged',
      },
    })

  return {
    pulls: {
      get: () => Promise.reject(new Error('not used')),
      list: () => Promise.reject(new Error('not used')),
      listFiles: () => Promise.reject(new Error('not used')),
      listReviewComments: () => Promise.reject(new Error('not used')),
      merge: pulls.merge ?? defaultMerge,
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
      createRef: () => Promise.reject(new Error('not used')),
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

describe('merge_pull_request operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns sha, merged, and message on success', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await mergePullRequestOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      pullNumber: 42,
    })) as { sha: string; merged: boolean; message: string }

    expect(result.sha).toBe('merge-sha-xyz')
    expect(result.merged).toBe(true)
    expect(result.message).toBe('Pull Request successfully merged')
  })

  test('handler defaults mergeMethod to merge and forwards optional fields', async () => {
    let captured: Parameters<GithubAdapter['pulls']['merge']>[0] | undefined
    setGithubAdapter(
      fakeAdapter({
        merge: (p) => {
          captured = p
          return Promise.resolve({ data: { sha: 'abc', merged: true, message: 'ok' } })
        },
      }),
    )

    await mergePullRequestOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      pullNumber: 7,
      commitTitle: 'Squash it',
      commitMessage: 'Body of merge commit',
      mergeMethod: 'squash',
    })

    expect(captured?.pull_number).toBe(7)
    expect(captured?.merge_method).toBe('squash')
    expect(captured?.commit_title).toBe('Squash it')
    expect(captured?.commit_message).toBe('Body of merge commit')
  })

  test('handler uses merge as default when mergeMethod is omitted', async () => {
    let captured: Parameters<GithubAdapter['pulls']['merge']>[0] | undefined
    setGithubAdapter(
      fakeAdapter({
        merge: (p) => {
          captured = p
          return Promise.resolve({ data: { sha: 'abc', merged: true, message: 'ok' } })
        },
      }),
    )

    await mergePullRequestOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      pullNumber: 1,
    })

    expect(captured?.merge_method).toBe('merge')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter({ merge: () => Promise.reject(new Error('PR is not mergeable')) }))

    const result = (await mergePullRequestOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      pullNumber: 42,
    })) as { error: string }

    expect(result.error).toContain('Failed to merge pull request')
    expect(result.error).toContain('PR is not mergeable')
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await mergePullRequestOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      pullNumber: 1,
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('dispatch rejects non-positive pullNumber with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter())

    for (const pullNumber of [0, -1, 1.5]) {
      let captured: unknown
      try {
        await dispatch(mergePullRequestOperation, localCtx, { owner: 'my-org', repo: 'api', pullNumber })
      } catch (err) {
        captured = err
      }
      expect(captured).toBeInstanceOf(OperationError)
      expect((captured as OperationError).code).toBe('invalid_input')
    }
  })

  test('operation has trustClass destructive', () => {
    expect(mergePullRequestOperation.trustClass).toBe('destructive')
  })

  test('operation metadata is write-scoped, mutating, non-localOnly', () => {
    expect(mergePullRequestOperation.id).toBe('merge_pull_request')
    expect(mergePullRequestOperation.scope).toBe('write')
    expect(mergePullRequestOperation.mutating).toBe(true)
    expect(mergePullRequestOperation.localOnly).toBe(false)
  })
})
