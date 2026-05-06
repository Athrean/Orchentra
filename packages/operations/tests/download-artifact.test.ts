import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { downloadArtifactOperation } from '../src/ops/github/download-artifact'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface ActionsOverride {
  downloadArtifact?: GithubAdapter['actions']['downloadArtifact']
}

function fakeAdapter(
  actions: ActionsOverride = {},
  capture?: { params?: Parameters<GithubAdapter['actions']['downloadArtifact']>[0] },
): GithubAdapter {
  const defaultDownload: GithubAdapter['actions']['downloadArtifact'] = (p) => {
    if (capture) capture.params = p
    return Promise.resolve({ data: Buffer.from('hello-artifact-bytes') })
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
      listWorkflowRunArtifacts: () => Promise.reject(new Error('not used')),
      downloadArtifact: actions.downloadArtifact ?? defaultDownload,
    },
    search: {
      code: () => Promise.reject(new Error('not used')),
    },
  }
}

describe('download_artifact operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns base64 contents + size + format', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await downloadArtifactOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      artifactId: 9001,
    })) as { contents: string; sizeInBytes: number; format: string; truncated?: boolean }

    expect(result.format).toBe('zip')
    expect(result.sizeInBytes).toBe(Buffer.from('hello-artifact-bytes').byteLength)
    expect(Buffer.from(result.contents, 'base64').toString('utf-8')).toBe('hello-artifact-bytes')
    expect(result.truncated).toBeUndefined()
  })

  test('handler defaults format to zip + forwards explicit format', async () => {
    const capture: { params?: Parameters<GithubAdapter['actions']['downloadArtifact']>[0] } = {}
    setGithubAdapter(fakeAdapter({}, capture))

    await downloadArtifactOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      artifactId: 9001,
    })
    expect(capture.params?.archive_format).toBe('zip')

    await downloadArtifactOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      artifactId: 9001,
      format: 'tar.gz',
    })
    expect(capture.params?.archive_format).toBe('tar.gz')
  })

  test('handler accepts ArrayBuffer payload', async () => {
    const ab = new ArrayBuffer(5)
    new Uint8Array(ab).set([1, 2, 3, 4, 5])
    setGithubAdapter(fakeAdapter({ downloadArtifact: () => Promise.resolve({ data: ab }) }))

    const result = (await downloadArtifactOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      artifactId: 9001,
    })) as { contents: string; sizeInBytes: number }

    expect(result.sizeInBytes).toBe(5)
    expect([...Buffer.from(result.contents, 'base64')]).toEqual([1, 2, 3, 4, 5])
  })

  test('handler truncates payloads larger than 10MB and flags it', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 17, 0x41) // 10MB + 17 bytes of 'A'
    setGithubAdapter(fakeAdapter({ downloadArtifact: () => Promise.resolve({ data: big }) }))

    const result = (await downloadArtifactOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      artifactId: 9001,
    })) as { contents: string; sizeInBytes: number; truncated?: boolean; originalSizeInBytes?: number }

    expect(result.truncated).toBe(true)
    expect(result.sizeInBytes).toBe(10 * 1024 * 1024)
    expect(result.originalSizeInBytes).toBe(big.byteLength)
    expect(Buffer.from(result.contents, 'base64').byteLength).toBe(10 * 1024 * 1024)
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await downloadArtifactOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      artifactId: 1,
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter({ downloadArtifact: () => Promise.reject(new Error('expired')) }))

    const result = (await downloadArtifactOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      artifactId: 9001,
    })) as { error: string }

    expect(result.error).toContain('Failed to download artifact')
  })

  test('dispatch rejects non-positive artifactId', async () => {
    setGithubAdapter(fakeAdapter())

    for (const artifactId of [0, -1, 1.5]) {
      let captured: unknown
      try {
        await dispatch(downloadArtifactOperation, localCtx, { owner: 'my-org', repo: 'api', artifactId })
      } catch (err) {
        captured = err
      }
      expect(captured).toBeInstanceOf(OperationError)
      expect((captured as OperationError).code).toBe('invalid_input')
    }
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(downloadArtifactOperation.id).toBe('download_artifact')
    expect(downloadArtifactOperation.scope).toBe('read')
    expect(downloadArtifactOperation.mutating).toBe(false)
    expect(downloadArtifactOperation.localOnly).toBe(false)
  })
})
