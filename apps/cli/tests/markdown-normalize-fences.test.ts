import { describe, expect, test } from 'bun:test'
import { normalizeNestedFences } from '../src/tui/markdown/normalize-fences'

describe('normalizeNestedFences', () => {
  test('leaves a plain code block untouched', () => {
    const input = '```ts\nconst x = 1\n```'
    expect(normalizeNestedFences(input)).toBe(input)
  })

  test('leaves prose without fences untouched', () => {
    const input = 'just some prose with `inline` code'
    expect(normalizeNestedFences(input)).toBe(input)
  })

  test('upgrades outer fence when inner fence is the same length', () => {
    const input = '```md\n```ts\ncode\n```\n```'
    const out = normalizeNestedFences(input)
    // Outer fence must be at least 4 backticks so the inner 3-backtick fence
    // is treated as content, not as the close of the outer fence.
    expect(out.startsWith('````md')).toBe(true)
    expect(out.endsWith('````')).toBe(true)
    // Inner content survives verbatim.
    expect(out).toContain('```ts\ncode\n```')
  })

  test('upgrades outer fence above the longest inner fence', () => {
    const input = '```md\n````ts\ncode\n````\n```'
    const out = normalizeNestedFences(input)
    // Inner uses 4 backticks; outer must be at least 5.
    expect(out.startsWith('`````md')).toBe(true)
    expect(out.endsWith('`````')).toBe(true)
    expect(out).toContain('````ts\ncode\n````')
  })

  test('handles tilde fences with the same rule', () => {
    const input = '~~~md\n~~~ts\ncode\n~~~\n~~~'
    const out = normalizeNestedFences(input)
    expect(out.startsWith('~~~~md')).toBe(true)
    expect(out.endsWith('~~~~')).toBe(true)
    expect(out).toContain('~~~ts\ncode\n~~~')
  })

  test('upgrades each top-level block independently', () => {
    const input = '```md\n```ts\nA\n```\n```\n\n```md\n```js\nB\n```\n```'
    const out = normalizeNestedFences(input)
    // Both outer fences should be upgraded to 4 backticks.
    const fence4 = out.match(/````md/g) ?? []
    expect(fence4.length).toBe(2)
  })

  test('preserves an unclosed outer fence as-is when no inner fence appears', () => {
    const input = '```ts\nconst x ='
    expect(normalizeNestedFences(input)).toBe(input)
  })

  test('upgrades outer fence even when it is mid-stream and unclosed', () => {
    const input = '```md\n```ts\nstill streaming'
    const out = normalizeNestedFences(input)
    expect(out.startsWith('````md')).toBe(true)
    expect(out).toContain('```ts\nstill streaming')
  })

  test('does not touch tilde fence inside a backtick block', () => {
    // Backtick fences are opaque; their content (including any tilde
    // sequences) is delegated to the backtick rules. The result here is
    // that the outer backtick fence stays at length 3 because no inner
    // backtick fence appears.
    const input = '```md\n~~~ts\ncode\n~~~\n```'
    expect(normalizeNestedFences(input)).toBe(input)
  })
})
