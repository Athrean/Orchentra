import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { createIssueOperation } from '../src/ops/github/create-issue'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

type IssuesCreateOverride = GithubAdapter['issues']['create']

function fakeAdapter(issuesCreate?: IssuesCreateOverride): GithubAdapter {
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
      create:
        issuesCreate ??
        (() =>
          Promise.resolve({
            data: { number: 42, html_url: 'https://github.com/my-org/api/issues/42', state: 'open' },
          })),
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

describe('create_issue operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns number and url on success', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await createIssueOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      title: 'CI keeps failing',
    })) as { number: number; url: string }

    expect(result.number).toBe(42)
    expect(result.url).toBe('https://github.com/my-org/api/issues/42')
  })

  test('handler passes optional fields to adapter', async () => {
    const calls: Parameters<GithubAdapter['issues']['create']>[0][] = []
    setGithubAdapter(
      fakeAdapter(async (p) => {
        calls.push(p)
        return { data: { number: 7, html_url: 'https://github.com/my-org/api/issues/7', state: 'open' } }
      }),
    )

    await createIssueOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      title: 'Bug report',
      body: 'Steps to reproduce...',
      labels: ['bug'],
      assignees: ['dev1'],
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].title).toBe('Bug report')
    expect(calls[0].body).toBe('Steps to reproduce...')
    expect(calls[0].labels).toEqual(['bug'])
    expect(calls[0].assignees).toEqual(['dev1'])
  })

  test('handler returns error for unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await createIssueOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      title: 'Nope',
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter(() => Promise.reject(new Error('API rate limit exceeded'))))

    const result = (await createIssueOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      title: 'Test',
    })) as { error: string }

    expect(result.error).toContain('Failed to create issue')
    expect(result.error).toContain('API rate limit exceeded')
  })

  test('dispatch rejects missing title with invalid_input', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(createIssueOperation, localCtx, { owner: 'my-org', repo: 'api' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is write-scoped, mutating, not local-only', () => {
    expect(createIssueOperation.id).toBe('create_issue')
    expect(createIssueOperation.scope).toBe('write')
    expect(createIssueOperation.trustClass).toBe('write')
    expect(createIssueOperation.mutating).toBe(true)
    expect(createIssueOperation.localOnly).toBe(false)
  })
})
