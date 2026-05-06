import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { createCheckRunOperation } from '../src/ops/github/create-check-run'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

type ChecksCreateOverride = GithubAdapter['checks']['create']

function fakeAdapter(checksCreate?: ChecksCreateOverride): GithubAdapter {
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
      createCommitStatus: () => Promise.reject(new Error('not used')),
    },
    checks: {
      listForRef: () => Promise.reject(new Error('not used')),
      create:
        checksCreate ??
        (() =>
          Promise.resolve({
            data: {
              id: 555,
              name: 'CI',
              status: 'queued',
              conclusion: null,
              started_at: null,
              completed_at: null,
              head_sha: 'abc1234',
              html_url: 'https://github.com/my-org/api/runs/555',
            },
          })),
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

describe('create_check_run operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns id and url on success', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await createCheckRunOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      name: 'CI',
      headSha: 'abc1234',
    })) as { id: number; url: string }

    expect(result.id).toBe(555)
    expect(result.url).toBe('https://github.com/my-org/api/runs/555')
  })

  test('handler passes optional fields to adapter', async () => {
    const calls: Parameters<GithubAdapter['checks']['create']>[0][] = []
    setGithubAdapter(
      fakeAdapter(async (p) => {
        calls.push(p)
        return {
          data: {
            id: 1,
            name: 'CI',
            status: 'completed',
            conclusion: 'success',
            started_at: null,
            completed_at: null,
            head_sha: 'abc1234',
            html_url: 'https://github.com/my-org/api/runs/1',
          },
        }
      }),
    )

    await createCheckRunOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      name: 'CI',
      headSha: 'abc1234',
      status: 'completed',
      conclusion: 'success',
      detailsUrl: 'https://ci.example.com/build/1',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].head_sha).toBe('abc1234')
    expect(calls[0].status).toBe('completed')
    expect(calls[0].conclusion).toBe('success')
    expect(calls[0].details_url).toBe('https://ci.example.com/build/1')
  })

  test('handler returns error for unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await createCheckRunOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      name: 'CI',
      headSha: 'abc',
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter(() => Promise.reject(new Error('Resource not accessible'))))

    const result = (await createCheckRunOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      name: 'CI',
      headSha: 'abc1234',
    })) as { error: string }

    expect(result.error).toContain('Failed to create check run')
  })

  test('dispatch rejects missing name with invalid_input', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(createCheckRunOperation, localCtx, { owner: 'my-org', repo: 'api', headSha: 'abc' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is write-scoped, mutating, not local-only', () => {
    expect(createCheckRunOperation.id).toBe('create_check_run')
    expect(createCheckRunOperation.scope).toBe('write')
    expect(createCheckRunOperation.trustClass).toBe('write')
    expect(createCheckRunOperation.mutating).toBe(true)
    expect(createCheckRunOperation.localOnly).toBe(false)
  })
})
