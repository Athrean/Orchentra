import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { getFileContentOperation } from '../src/ops/github/get-file-content'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

function fakeAdapter(getContent: GithubAdapter['repos']['getContent']): GithubAdapter {
  return {
    pulls: {
      get: () => Promise.reject(new Error('not used')),
      listFiles: () => Promise.reject(new Error('not used')),
      listReviewComments: () => Promise.reject(new Error('not used')),
    },
    issues: {
      get: () => Promise.reject(new Error('not used')),
      listComments: () => Promise.reject(new Error('not used')),
    },
    repos: {
      getCommit: () => Promise.reject(new Error('not used')),
      getContent,
    },
    search: {
      code: () => Promise.reject(new Error('not used')),
    },
  }
}

describe('get_file_content operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns decoded file content for a monitored repo', async () => {
    setGithubAdapter(
      fakeAdapter(() =>
        Promise.resolve({
          data: {
            type: 'file',
            path: '.github/workflows/ci.yml',
            content: Buffer.from('name: CI\non: push\n').toString('base64'),
            size: 18,
          },
        }),
      ),
    )

    const result = (await getFileContentOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      path: '.github/workflows/ci.yml',
    })) as { path: string; content: string; truncated: boolean; size: number }

    expect(result.path).toBe('.github/workflows/ci.yml')
    expect(result.content).toContain('name: CI')
    expect(result.truncated).toBe(false)
    expect(result.size).toBe(18)
  })

  test('handler returns error when path is a directory', async () => {
    setGithubAdapter(fakeAdapter(() => Promise.resolve({ data: [] as unknown as never })))

    const result = (await getFileContentOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      path: 'src/',
    })) as { error: string }

    expect(result.error).toContain('directory')
  })

  test('handler truncates content over MAX_FILE_CHARS', async () => {
    const big = 'x'.repeat(5000)
    setGithubAdapter(
      fakeAdapter(() =>
        Promise.resolve({
          data: {
            type: 'file',
            path: 'big.txt',
            content: Buffer.from(big).toString('base64'),
            size: 5000,
          },
        }),
      ),
    )

    const result = (await getFileContentOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      path: 'big.txt',
    })) as { path: string; content: string; truncated: boolean }

    expect(result.truncated).toBe(true)
    expect(result.content).toContain('[truncated]')
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter(() => Promise.reject(new Error('should not call'))))

    const result = (await getFileContentOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      path: 'foo.txt',
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter(() => Promise.reject(new Error('Not Found'))))

    const result = (await getFileContentOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      path: 'missing.txt',
    })) as { error: string }

    expect(result.error).toContain('Failed to fetch file')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter(() => Promise.reject(new Error('not used'))))

    let captured: unknown
    try {
      await dispatch(getFileContentOperation, localCtx, { owner: 'my-org', repo: 'api' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(getFileContentOperation.id).toBe('get_file_content')
    expect(getFileContentOperation.scope).toBe('read')
    expect(getFileContentOperation.mutating).toBe(false)
    expect(getFileContentOperation.localOnly).toBe(false)
  })
})
