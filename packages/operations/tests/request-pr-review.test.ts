import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { requestPrReviewOperation } from '../src/ops/github/request-pr-review'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

type RequestReviewersOverride = GithubAdapter['pulls']['requestReviewers']

function fakeAdapter(requestReviewers?: RequestReviewersOverride): GithubAdapter {
  return {
    pulls: {
      get: () => Promise.reject(new Error('not used')),
      list: () => Promise.reject(new Error('not used')),
      listFiles: () => Promise.reject(new Error('not used')),
      listReviewComments: () => Promise.reject(new Error('not used')),
      create: () => Promise.reject(new Error('not used')),
      requestReviewers:
        requestReviewers ??
        (() =>
          Promise.resolve({
            data: {
              requested_reviewers: [{ login: 'dev1' }],
              requested_teams: [],
            },
          })),
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
      createCommitStatus: () => Promise.reject(new Error('not used')),
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

describe('request_pr_review operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns ok:true on success with individual reviewers', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await requestPrReviewOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      pullNumber: 42,
      reviewers: ['dev1', 'dev2'],
    })) as { ok: boolean }

    expect(result.ok).toBe(true)
  })

  test('handler returns ok:true on success with team reviewers', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await requestPrReviewOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      pullNumber: 42,
      teamReviewers: ['platform-team'],
    })) as { ok: boolean }

    expect(result.ok).toBe(true)
  })

  test('handler passes pull_number and team_reviewers to adapter', async () => {
    const calls: Parameters<GithubAdapter['pulls']['requestReviewers']>[0][] = []
    setGithubAdapter(
      fakeAdapter(async (p) => {
        calls.push(p)
        return { data: { requested_reviewers: [], requested_teams: [] } }
      }),
    )

    await requestPrReviewOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      pullNumber: 7,
      reviewers: ['alice'],
      teamReviewers: ['backend'],
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].pull_number).toBe(7)
    expect(calls[0].reviewers).toEqual(['alice'])
    expect(calls[0].team_reviewers).toEqual(['backend'])
  })

  test('handler returns error when both reviewers and teamReviewers are absent', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await requestPrReviewOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      pullNumber: 42,
    })) as { error: string }

    expect(result.error).toContain('At least one of reviewers or teamReviewers')
  })

  test('handler returns error when both reviewer arrays are empty', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await requestPrReviewOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      pullNumber: 42,
      reviewers: [],
      teamReviewers: [],
    })) as { error: string }

    expect(result.error).toContain('At least one of reviewers or teamReviewers')
  })

  test('handler returns error for unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await requestPrReviewOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      pullNumber: 1,
      reviewers: ['dev1'],
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter(() => Promise.reject(new Error('Forbidden'))))

    const result = (await requestPrReviewOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      pullNumber: 42,
      reviewers: ['dev1'],
    })) as { error: string }

    expect(result.error).toContain('Failed to request review')
  })

  test('dispatch rejects non-positive pullNumber with invalid_input', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(requestPrReviewOperation, localCtx, {
        owner: 'my-org',
        repo: 'api',
        pullNumber: 0,
        reviewers: ['dev1'],
      })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is write-scoped, mutating, not local-only', () => {
    expect(requestPrReviewOperation.id).toBe('request_pr_review')
    expect(requestPrReviewOperation.scope).toBe('write')
    expect(requestPrReviewOperation.trustClass).toBe('write')
    expect(requestPrReviewOperation.mutating).toBe(true)
    expect(requestPrReviewOperation.localOnly).toBe(false)
  })
})
