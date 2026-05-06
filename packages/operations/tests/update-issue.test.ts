import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { updateIssueOperation } from '../src/ops/github/update-issue'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

type IssuesUpdateOverride = GithubAdapter['issues']['update']

function fakeAdapter(issuesUpdate?: IssuesUpdateOverride): GithubAdapter {
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
      update:
        issuesUpdate ??
        (() =>
          Promise.resolve({
            data: { number: 10, html_url: 'https://github.com/my-org/api/issues/10', state: 'closed' },
          })),
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

describe('update_issue operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns number and url on success', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await updateIssueOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      issueNumber: 10,
      state: 'closed',
    })) as { number: number; url: string }

    expect(result.number).toBe(10)
    expect(result.url).toBe('https://github.com/my-org/api/issues/10')
  })

  test('handler passes issue_number to adapter', async () => {
    const calls: Parameters<GithubAdapter['issues']['update']>[0][] = []
    setGithubAdapter(
      fakeAdapter(async (p) => {
        calls.push(p)
        return { data: { number: 5, html_url: 'https://github.com/my-org/api/issues/5', state: 'open' } }
      }),
    )

    await updateIssueOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      issueNumber: 5,
      title: 'Updated title',
      labels: ['wontfix'],
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].issue_number).toBe(5)
    expect(calls[0].title).toBe('Updated title')
    expect(calls[0].labels).toEqual(['wontfix'])
  })

  test('handler returns error for unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await updateIssueOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      issueNumber: 1,
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter(() => Promise.reject(new Error('Not Found'))))

    const result = (await updateIssueOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      issueNumber: 999,
    })) as { error: string }

    expect(result.error).toContain('Failed to update issue')
  })

  test('dispatch rejects non-positive issueNumber with invalid_input', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(updateIssueOperation, localCtx, { owner: 'my-org', repo: 'api', issueNumber: -1 })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('dispatch rejects missing issueNumber with invalid_input', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(updateIssueOperation, localCtx, { owner: 'my-org', repo: 'api' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is write-scoped, mutating, not local-only', () => {
    expect(updateIssueOperation.id).toBe('update_issue')
    expect(updateIssueOperation.scope).toBe('write')
    expect(updateIssueOperation.trustClass).toBe('write')
    expect(updateIssueOperation.mutating).toBe(true)
    expect(updateIssueOperation.localOnly).toBe(false)
  })
})
