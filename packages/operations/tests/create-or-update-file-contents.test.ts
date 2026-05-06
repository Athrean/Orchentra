import { beforeEach, describe, expect, test } from 'bun:test'
import {
  setGithubAdapter,
  setRepoMonitoredCheck,
  type GithubAdapter,
  type GithubCreateOrUpdateFileResponse,
} from '../src/adapters/github'
import { createOrUpdateFileContentsOperation } from '../src/ops/github/create-or-update-file-contents'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

const defaultFileResponse: GithubCreateOrUpdateFileResponse = {
  commit: { sha: 'commit-sha-abc', html_url: 'https://github.com/my-org/api/commit/commit-sha-abc' },
  content: { sha: 'blob-sha-def', html_url: 'https://github.com/my-org/api/blob/main/src/foo.ts', path: 'src/foo.ts' },
}

interface ReposOverride {
  createOrUpdateFileContents?: GithubAdapter['repos']['createOrUpdateFileContents']
}

function fakeAdapter(repos: ReposOverride = {}): GithubAdapter {
  const defaultCreateOrUpdate: GithubAdapter['repos']['createOrUpdateFileContents'] = () =>
    Promise.resolve({ data: defaultFileResponse })

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
      createOrUpdateFileContents: repos.createOrUpdateFileContents ?? defaultCreateOrUpdate,
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

describe('create_or_update_file_contents operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns sha and url from content block on success', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await createOrUpdateFileContentsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      path: 'src/foo.ts',
      message: 'add foo',
      content: Buffer.from('hello').toString('base64'),
    })) as { sha: string; url: string }

    expect(result.sha).toBe('blob-sha-def')
    expect(result.url).toBe('https://github.com/my-org/api/blob/main/src/foo.ts')
  })

  test('handler falls back to commit sha+url when content is null', async () => {
    const responseWithNullContent: GithubCreateOrUpdateFileResponse = {
      commit: { sha: 'commit-sha-abc', html_url: 'https://github.com/my-org/api/commit/commit-sha-abc' },
      content: null,
    }
    setGithubAdapter(
      fakeAdapter({ createOrUpdateFileContents: () => Promise.resolve({ data: responseWithNullContent }) }),
    )

    const result = (await createOrUpdateFileContentsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      path: 'src/foo.ts',
      message: 'delete file',
      content: '',
    })) as { sha: string; url: string }

    expect(result.sha).toBe('commit-sha-abc')
    expect(result.url).toBe('https://github.com/my-org/api/commit/commit-sha-abc')
  })

  test('handler forwards optional branch and sha to adapter', async () => {
    let captured: Parameters<GithubAdapter['repos']['createOrUpdateFileContents']>[0] | undefined
    setGithubAdapter(
      fakeAdapter({
        createOrUpdateFileContents: (p) => {
          captured = p
          return Promise.resolve({ data: defaultFileResponse })
        },
      }),
    )

    await createOrUpdateFileContentsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      path: 'src/bar.ts',
      message: 'update bar',
      content: Buffer.from('world').toString('base64'),
      branch: 'feat/my-branch',
      sha: 'existing-blob-sha',
    })

    expect(captured?.branch).toBe('feat/my-branch')
    expect(captured?.sha).toBe('existing-blob-sha')
    expect(captured?.path).toBe('src/bar.ts')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter({ createOrUpdateFileContents: () => Promise.reject(new Error('422 conflict')) }))

    const result = (await createOrUpdateFileContentsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      path: 'src/foo.ts',
      message: 'update',
      content: 'aGVsbG8=',
    })) as { error: string }

    expect(result.error).toContain('Failed to create or update file contents')
    expect(result.error).toContain('422 conflict')
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await createOrUpdateFileContentsOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      path: 'README.md',
      message: 'pwn',
      content: 'aGVsbG8=',
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('dispatch rejects missing required fields with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(createOrUpdateFileContentsOperation, localCtx, {
        owner: 'my-org',
        repo: 'api',
        // missing path, message, content
      })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is write-scoped, mutating, non-localOnly, trustClass write', () => {
    expect(createOrUpdateFileContentsOperation.id).toBe('create_or_update_file_contents')
    expect(createOrUpdateFileContentsOperation.scope).toBe('write')
    expect(createOrUpdateFileContentsOperation.trustClass).toBe('write')
    expect(createOrUpdateFileContentsOperation.mutating).toBe(true)
    expect(createOrUpdateFileContentsOperation.localOnly).toBe(false)
  })
})
