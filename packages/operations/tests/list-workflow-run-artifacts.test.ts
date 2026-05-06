import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { listWorkflowRunArtifactsOperation } from '../src/ops/github/list-workflow-run-artifacts'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface ActionsOverride {
  listWorkflowRunArtifacts?: GithubAdapter['actions']['listWorkflowRunArtifacts']
}

function fakeAdapter(
  actions: ActionsOverride = {},
  capture?: { params?: Parameters<GithubAdapter['actions']['listWorkflowRunArtifacts']>[0] },
): GithubAdapter {
  const defaultList: GithubAdapter['actions']['listWorkflowRunArtifacts'] = (p) => {
    if (capture) capture.params = p
    return Promise.resolve({
      data: {
        total_count: 2,
        artifacts: [
          {
            id: 9001,
            name: 'build-logs',
            size_in_bytes: 12345,
            expired: false,
            archive_download_url: 'https://api.github.com/repos/my-org/api/actions/artifacts/9001/zip',
          },
          {
            id: 9002,
            name: 'coverage',
            size_in_bytes: 67890,
            expired: true,
            archive_download_url: 'https://api.github.com/repos/my-org/api/actions/artifacts/9002/zip',
          },
        ],
      },
    })
  }
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
      get: () => Promise.reject(new Error('not used')),
      getCommit: () => Promise.reject(new Error('not used')),
      getContent: () => Promise.reject(new Error('not used')),
      listBranches: () => Promise.reject(new Error('not used')),
      listLanguages: () => Promise.reject(new Error('not used')),
      getAllTopics: () => Promise.reject(new Error('not used')),
    },
    checks: {
      listForRef: () => Promise.reject(new Error('not used')),
    },
    actions: {
      listWorkflowRunArtifacts: actions.listWorkflowRunArtifacts ?? defaultList,
      downloadArtifact: () => Promise.reject(new Error('not used')),
    },
    search: {
      code: () => Promise.reject(new Error('not used')),
    },
  }
}

describe('list_workflow_run_artifacts operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns artifacts with normalized field names', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await listWorkflowRunArtifactsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      runId: 555,
    })) as {
      total: number
      artifacts: Array<{
        id: number
        name: string
        sizeInBytes: number
        expired: boolean
        archiveDownloadUrl: string
      }>
    }

    expect(result.total).toBe(2)
    expect(result.artifacts).toHaveLength(2)
    expect(result.artifacts[0].id).toBe(9001)
    expect(result.artifacts[0].name).toBe('build-logs')
    expect(result.artifacts[0].sizeInBytes).toBe(12345)
    expect(result.artifacts[0].expired).toBe(false)
    expect(result.artifacts[1].expired).toBe(true)
  })

  test('handler forwards runId to the adapter', async () => {
    const capture: { params?: Parameters<GithubAdapter['actions']['listWorkflowRunArtifacts']>[0] } = {}
    setGithubAdapter(fakeAdapter({}, capture))

    await listWorkflowRunArtifactsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      runId: 12345,
    })

    expect(capture.params?.run_id).toBe(12345)
    expect(capture.params?.owner).toBe('my-org')
    expect(capture.params?.repo).toBe('api')
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await listWorkflowRunArtifactsOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      runId: 1,
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter({ listWorkflowRunArtifacts: () => Promise.reject(new Error('Not Found')) }))

    const result = (await listWorkflowRunArtifactsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      runId: 9999,
    })) as { error: string }

    expect(result.error).toContain('Failed to list workflow run artifacts')
  })

  test('dispatch rejects non-positive runId', async () => {
    setGithubAdapter(fakeAdapter())

    for (const runId of [0, -1, 1.5]) {
      let captured: unknown
      try {
        await dispatch(listWorkflowRunArtifactsOperation, localCtx, { owner: 'my-org', repo: 'api', runId })
      } catch (err) {
        captured = err
      }
      expect(captured).toBeInstanceOf(OperationError)
      expect((captured as OperationError).code).toBe('invalid_input')
    }
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(listWorkflowRunArtifactsOperation.id).toBe('list_workflow_run_artifacts')
    expect(listWorkflowRunArtifactsOperation.scope).toBe('read')
    expect(listWorkflowRunArtifactsOperation.mutating).toBe(false)
    expect(listWorkflowRunArtifactsOperation.localOnly).toBe(false)
  })
})
