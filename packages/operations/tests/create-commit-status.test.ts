import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { createCommitStatusOperation } from '../src/ops/github/create-commit-status'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

type CreateStatusOverride = GithubAdapter['repos']['createCommitStatus']

function fakeAdapter(createStatus?: CreateStatusOverride): GithubAdapter {
  return {
    pulls: {
      get: () => Promise.reject(new Error('not used')),
      list: () => Promise.reject(new Error('not used')),
      listFiles: () => Promise.reject(new Error('not used')),
      listReviewComments: () => Promise.reject(new Error('not used')),
      create: () => Promise.reject(new Error('not used')),
      requestReviewers: () => Promise.reject(new Error('not used')),
    },
    issues: {
      get: () => Promise.reject(new Error('not used')),
      list: () => Promise.reject(new Error('not used')),
      listComments: () => Promise.reject(new Error('not used')),
      create: () => Promise.reject(new Error('not used')),
      update: () => Promise.reject(new Error('not used')),
    },
    repos: {
      get: () => Promise.reject(new Error('not used')),
      getCommit: () => Promise.reject(new Error('not used')),
      getContent: () => Promise.reject(new Error('not used')),
      listBranches: () => Promise.reject(new Error('not used')),
      listLanguages: () => Promise.reject(new Error('not used')),
      getAllTopics: () => Promise.reject(new Error('not used')),
      createCommitStatus:
        createStatus ??
        (() =>
          Promise.resolve({
            data: {
              id: 123,
              state: 'success',
              target_url: null,
              description: null,
              context: 'default',
            },
          })),
    },
    checks: {
      listForRef: () => Promise.reject(new Error('not used')),
      create: () => Promise.reject(new Error('not used')),
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

describe('create_commit_status operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns id and state on success', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await createCommitStatusOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      sha: 'abc1234',
      state: 'success',
    })) as { id: number; state: string }

    expect(result.id).toBe(123)
    expect(result.state).toBe('success')
  })

  test('handler passes optional fields to adapter', async () => {
    const calls: Parameters<GithubAdapter['repos']['createCommitStatus']>[0][] = []
    setGithubAdapter(
      fakeAdapter(async (p) => {
        calls.push(p)
        return {
          data: { id: 1, state: 'pending', target_url: 'https://ci.example.com', description: null, context: null },
        }
      }),
    )

    await createCommitStatusOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      sha: 'def5678',
      state: 'pending',
      targetUrl: 'https://ci.example.com',
      description: 'Build in progress',
      context: 'ci/build',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].sha).toBe('def5678')
    expect(calls[0].state).toBe('pending')
    expect(calls[0].target_url).toBe('https://ci.example.com')
    expect(calls[0].description).toBe('Build in progress')
    expect(calls[0].context).toBe('ci/build')
  })

  test('handler returns error for unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await createCommitStatusOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      sha: 'abc',
      state: 'failure',
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter(() => Promise.reject(new Error('SHA not found'))))

    const result = (await createCommitStatusOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      sha: 'badsha',
      state: 'error',
    })) as { error: string }

    expect(result.error).toContain('Failed to create commit status')
  })

  test('dispatch rejects invalid state with invalid_input', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(createCommitStatusOperation, localCtx, {
        owner: 'my-org',
        repo: 'api',
        sha: 'abc',
        state: 'unknown',
      })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('dispatch rejects description over 140 chars with invalid_input', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(createCommitStatusOperation, localCtx, {
        owner: 'my-org',
        repo: 'api',
        sha: 'abc',
        state: 'success',
        description: 'x'.repeat(141),
      })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is write-scoped, mutating, not local-only', () => {
    expect(createCommitStatusOperation.id).toBe('create_commit_status')
    expect(createCommitStatusOperation.scope).toBe('write')
    expect(createCommitStatusOperation.trustClass).toBe('write')
    expect(createCommitStatusOperation.mutating).toBe(true)
    expect(createCommitStatusOperation.localOnly).toBe(false)
  })
})
