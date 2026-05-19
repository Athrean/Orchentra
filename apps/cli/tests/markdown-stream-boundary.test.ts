import { describe, expect, test } from 'bun:test'
import { findStreamSafeBoundary, splitAtStreamBoundary } from '../src/tui/markdown/stream'

// Additional coverage for the stream-safe boundary helper that the markdown
// renderer uses while assistant turns stream in. Sister file to
// markdown-stream.test.ts; this one focuses on opaqueness-inside-fence
// guarantees (no flush mid-fence, even when the inside contains text that
// would otherwise close a different fence kind) and on tilde fences.

describe('findStreamSafeBoundary — fence opaqueness', () => {
  test('open tilde fence with no closer marks the fence-open line as the boundary', () => {
    const text = 'intro paragraph\n\n~~~ts\nconst x = 1\nconst y'
    const cut = findStreamSafeBoundary(text)
    expect(text.slice(cut).startsWith('~~~ts')).toBe(true)
  })

  test('closed tilde fence is safe through the closing line', () => {
    const text = '~~~ts\nconst x = 1\n~~~\nnext paragraph...'
    const cut = findStreamSafeBoundary(text)
    expect(text.slice(0, cut).endsWith('~~~\n')).toBe(true)
    expect(text.slice(cut)).toBe('next paragraph...')
  })

  test('blank line inside an open backtick fence does not flush the fence open', () => {
    // Even with a blank line inside the still-open fence, the boundary must
    // sit at the fence-open line (or earlier), never inside the fence.
    const text = 'intro\n\n```ts\n\nstill streaming'
    const cut = findStreamSafeBoundary(text)
    expect(text.slice(cut).startsWith('```ts')).toBe(true)
  })

  test('blank line inside an open tilde fence does not flush the fence open', () => {
    const text = 'intro\n\n~~~ts\n\nstill streaming'
    const cut = findStreamSafeBoundary(text)
    expect(text.slice(cut).startsWith('~~~ts')).toBe(true)
  })

  test('content inside a closed backtick fence containing a tilde sequence is fully flushable', () => {
    const text = '```md\n~~~ts\ncode\n~~~\n```\nafter'
    const cut = findStreamSafeBoundary(text)
    expect(text.slice(0, cut).endsWith('```\n')).toBe(true)
    expect(text.slice(cut)).toBe('after')
  })
})

describe('splitAtStreamBoundary — invariants', () => {
  test('split is lossless even with mixed fence kinds', () => {
    const text = '```ts\nA\n```\n\n~~~js\nB'
    const { safe, pending } = splitAtStreamBoundary(text)
    expect(safe + pending).toBe(text)
    expect(pending.startsWith('~~~js')).toBe(true)
  })
})
