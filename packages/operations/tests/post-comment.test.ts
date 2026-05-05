import { describe, expect, test } from 'bun:test'
import { dispatch, type OperationContext } from '../src'
import { postCommentOp, type PostCommentAdapters } from '../src/ops/github/post-comment'

interface CapturedCall {
  owner: string
  repo: string
  issue_number: number
  body: string
}

function makeAdapters(overrides: Partial<PostCommentAdapters> = {}): {
  adapters: PostCommentAdapters
  calls: CapturedCall[]
} {
  const calls: CapturedCall[] = []
  const adapters: PostCommentAdapters = {
    commentsEnabled: () => true,
    isRepoMonitored: async () => true,
    createComment: async (input) => {
      calls.push(input)
      return { id: 99, html_url: 'https://github.com/my-org/api/pull/42#issuecomment-99' }
    },
    ...overrides,
  }
  return { adapters, calls }
}

const ctx = (adapters: PostCommentAdapters): OperationContext => ({ remote: false, creds: { postComment: adapters } })

describe('post_comment operation', () => {
  test('posts comment and returns commentId + commentUrl', async () => {
    const { adapters, calls } = makeAdapters()

    const result = await dispatch(postCommentOp, ctx(adapters), {
      owner: 'my-org',
      repo: 'api',
      prNumber: 42,
      body: 'Investigation in progress.',
      kind: 'progress',
    })

    expect(result).toEqual({
      commentId: 99,
      commentUrl: 'https://github.com/my-org/api/pull/42#issuecomment-99',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].owner).toBe('my-org')
    expect(calls[0].repo).toBe('api')
    expect(calls[0].issue_number).toBe(42)
  })

  test('prefixes body with kind header for note', async () => {
    const { adapters, calls } = makeAdapters()

    await dispatch(postCommentOp, ctx(adapters), {
      owner: 'my-org',
      repo: 'api',
      prNumber: 1,
      body: 'Found a flaky test.',
      kind: 'note',
    })

    expect(calls[0].body).toContain('## Orchentra Triage Note')
    expect(calls[0].body).toContain('Found a flaky test.')
  })

  test('uses correct header per kind', async () => {
    const { adapters, calls } = makeAdapters()

    await dispatch(postCommentOp, ctx(adapters), {
      owner: 'my-org',
      repo: 'api',
      prNumber: 1,
      body: 'final summary',
      kind: 'final',
    })
    expect(calls[calls.length - 1]?.body).toContain('## Orchentra Triage Results')

    await dispatch(postCommentOp, ctx(adapters), {
      owner: 'my-org',
      repo: 'api',
      prNumber: 1,
      body: 'progress update',
      kind: 'progress',
    })
    expect(calls[calls.length - 1]?.body).toContain('## Orchentra Triage Update')
  })

  test('returns error when comments are disabled (no API call)', async () => {
    const { adapters, calls } = makeAdapters({ commentsEnabled: () => false })

    const result = (await dispatch(postCommentOp, ctx(adapters), {
      owner: 'my-org',
      repo: 'api',
      prNumber: 42,
      body: 'hi',
      kind: 'note',
    })) as { error?: string }

    expect(result.error).toContain('disabled')
    expect(calls).toHaveLength(0)
  })

  test('rejects unmonitored repos', async () => {
    const { adapters, calls } = makeAdapters({ isRepoMonitored: async () => false })

    const result = (await dispatch(postCommentOp, ctx(adapters), {
      owner: 'evil',
      repo: 'corp',
      prNumber: 1,
      body: 'hi',
      kind: 'note',
    })) as { error?: string }

    expect(result.error).toContain('not monitored')
    expect(calls).toHaveLength(0)
  })

  test('returns error on API failure', async () => {
    const { adapters } = makeAdapters({
      createComment: async () => {
        throw new Error('GitHub API rate limit')
      },
    })

    const result = (await dispatch(postCommentOp, ctx(adapters), {
      owner: 'my-org',
      repo: 'api',
      prNumber: 42,
      body: 'hi',
      kind: 'note',
    })) as { error?: string }

    expect(result.error).toContain('Failed to post comment')
  })

  test('rejects body longer than 6000 chars at the schema boundary', async () => {
    const { adapters, calls } = makeAdapters()

    let caught: unknown
    try {
      await dispatch(postCommentOp, ctx(adapters), {
        owner: 'my-org',
        repo: 'api',
        prNumber: 1,
        body: 'x'.repeat(10_000),
        kind: 'note',
      })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeDefined()
    expect(calls).toHaveLength(0)
  })

  test('accepts and forwards a 6000-char body unchanged', async () => {
    const { adapters, calls } = makeAdapters()

    await dispatch(postCommentOp, ctx(adapters), {
      owner: 'my-org',
      repo: 'api',
      prNumber: 1,
      body: 'x'.repeat(6000),
      kind: 'note',
    })

    const xCount = calls[0].body.match(/x/g)?.length ?? 0
    expect(xCount).toBe(6000)
  })

  test('declares write scope, mutating, not local-only', () => {
    expect(postCommentOp.scope).toBe('write')
    expect(postCommentOp.mutating).toBe(true)
    expect(postCommentOp.localOnly).toBe(false)
    expect(postCommentOp.id).toBe('post_comment')
  })
})
