import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { createPullRequestOperation } from '../src/ops/github/create-pull-request'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

type PullsCreateOverride = GithubAdapter['pulls']['create']

function fakeAdapter(pullsCreate?: PullsCreateOverride): GithubAdapter {
  return {
    pulls: {
      get: () => Promise.reject(new Error('not used')),
      list: () => Promise.reject(new Error('not used')),
      listFiles: () => Promise.reject(new Error('not used')),
      listReviewComments: () => Promise.reject(new Error('not used')),
      create:
        pullsCreate ??
        (() =>
          Promise.resolve({
            data: { number: 99, html_url: 'https://github.com/my-org/api/pull/99', state: 'open' },
          })),
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

describe('create_pull_request operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns number and url on success', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await createPullRequestOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      title: 'Add feature X',
      head: 'feat/x',
      base: 'main',
    })) as { number: number; url: string }

    expect(result.number).toBe(99)
    expect(result.url).toBe('https://github.com/my-org/api/pull/99')
  })

  test('handler passes optional fields to adapter', async () => {
    const calls: Parameters<GithubAdapter['pulls']['create']>[0][] = []
    setGithubAdapter(
      fakeAdapter(async (p) => {
        calls.push(p)
        return { data: { number: 7, html_url: 'https://github.com/my-org/api/pull/7', state: 'open' } }
      }),
    )

    await createPullRequestOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      title: 'Draft PR',
      head: 'feat/draft',
      base: 'main',
      body: 'WIP',
      draft: true,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].draft).toBe(true)
    expect(calls[0].body).toBe('WIP')
    expect(calls[0].head).toBe('feat/draft')
    expect(calls[0].base).toBe('main')
  })

  test('handler returns error for unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await createPullRequestOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      title: 'Nope',
      head: 'x',
      base: 'main',
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter(() => Promise.reject(new Error('Unprocessable Entity'))))

    const result = (await createPullRequestOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      title: 'Bad PR',
      head: 'feat/x',
      base: 'main',
    })) as { error: string }

    expect(result.error).toContain('Failed to create pull request')
  })

  test('dispatch rejects missing head with invalid_input', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(createPullRequestOperation, localCtx, {
        owner: 'my-org',
        repo: 'api',
        title: 'No head',
        base: 'main',
      })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is write-scoped, mutating, not local-only', () => {
    expect(createPullRequestOperation.id).toBe('create_pull_request')
    expect(createPullRequestOperation.scope).toBe('write')
    expect(createPullRequestOperation.trustClass).toBe('write')
    expect(createPullRequestOperation.mutating).toBe(true)
    expect(createPullRequestOperation.localOnly).toBe(false)
  })
})
