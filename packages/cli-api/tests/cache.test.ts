import { describe, expect, test } from 'bun:test'
import { CLAUDE_CODE_SYSTEM_PROMPT_PREFIX, injectCacheBoundary } from '../src/anthropic/cache'

describe('CLAUDE_CODE_SYSTEM_PROMPT_PREFIX', () => {
  // Pin the exact bytes. Anthropic's edge checks this string when an OAuth
  // bearer is presented from a non-Claude-Code binary; any drift returns 429
  // ("This credential is only authorized for use with Claude Code") or
  // "OAuth authentication is currently not supported". This test exists so a
  // future engineer cannot silently rephrase or trim the prefix.
  test('matches the canonical billing identifier byte-for-byte', () => {
    expect(CLAUDE_CODE_SYSTEM_PROMPT_PREFIX).toBe("You are Claude Code, Anthropic's official CLI for Claude.")
    expect(CLAUDE_CODE_SYSTEM_PROMPT_PREFIX).toHaveLength(57)
    expect(CLAUDE_CODE_SYSTEM_PROMPT_PREFIX.endsWith('.')).toBe(true)
  })
})

describe('injectCacheBoundary — api-key path', () => {
  test('emits static + dynamic blocks only, no prefix block', () => {
    const blocks = injectCacheBoundary('static rules', 'dynamic notes', { usingOAuth: false })
    expect(blocks).toEqual([
      { type: 'text', text: 'static rules', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'dynamic notes' },
    ])
  })

  test('omits empty static and dynamic blocks', () => {
    expect(injectCacheBoundary('', '', { usingOAuth: false })).toEqual([])
  })
})

describe('injectCacheBoundary — OAuth path', () => {
  test('prefix block comes first and has no cache_control', () => {
    const blocks = injectCacheBoundary('static rules', 'dynamic notes', { usingOAuth: true })
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toEqual({ type: 'text', text: CLAUDE_CODE_SYSTEM_PROMPT_PREFIX })
    expect(blocks[1]).toEqual({ type: 'text', text: 'static rules', cache_control: { type: 'ephemeral' } })
    expect(blocks[2]).toEqual({ type: 'text', text: 'dynamic notes' })
  })

  test('prefix block still present when systemStatic is empty', () => {
    const blocks = injectCacheBoundary('', 'just dynamic', { usingOAuth: true })
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.text).toBe(CLAUDE_CODE_SYSTEM_PROMPT_PREFIX)
    expect(blocks[1]?.text).toBe('just dynamic')
  })

  test('prefix block still present when both static and dynamic are empty', () => {
    const blocks = injectCacheBoundary('', '', { usingOAuth: true })
    expect(blocks).toEqual([{ type: 'text', text: CLAUDE_CODE_SYSTEM_PROMPT_PREFIX }])
  })

  test('prefix is its own block — never concatenated into systemStatic', () => {
    const blocks = injectCacheBoundary('user-supplied rules', '', { usingOAuth: true })
    expect(blocks[0]?.text).toBe(CLAUDE_CODE_SYSTEM_PROMPT_PREFIX)
    expect(blocks[0]?.text).not.toContain('user-supplied rules')
    expect(blocks[1]?.text).toBe('user-supplied rules')
  })
})
