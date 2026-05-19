import { describe, expect, test } from 'bun:test'
import {
  parseMarkdown,
  resetParseMarkdownCache,
  getParseMarkdownCacheSize,
  setParseMarkdownLexerSpy,
  type Block,
} from '../src/tui/markdown/parse'

describe('parseMarkdown integration', () => {
  test('identical input returns the same token array (cache hit)', () => {
    resetParseMarkdownCache()
    const input = '# Heading\n\nbody with `code` and **bold**'
    const a = parseMarkdown(input)
    const sizeAfterFirst = getParseMarkdownCacheSize()
    expect(sizeAfterFirst).toBe(1)
    const b = parseMarkdown(input)
    const sizeAfterSecond = getParseMarkdownCacheSize()
    // Cache size is stable on a hit.
    expect(sizeAfterSecond).toBe(1)
    // Returned array is referentially identical to the first call.
    expect(b).toBe(a)
  })

  test('plain prose bypasses the lexer entirely', () => {
    resetParseMarkdownCache()
    let lexerCalls = 0
    setParseMarkdownLexerSpy(() => {
      lexerCalls++
    })
    try {
      const out = parseMarkdown('hello world this is just prose without any markers')
      expect(out.length).toBe(1)
      expect(out[0].kind).toBe('paragraph')
      if (out[0].kind === 'paragraph') {
        expect(out[0].text).toBe('hello world this is just prose without any markers')
      }
      expect(lexerCalls).toBe(0)
    } finally {
      setParseMarkdownLexerSpy(null)
    }
  })

  test('input with a marker triggers the lexer', () => {
    resetParseMarkdownCache()
    let lexerCalls = 0
    setParseMarkdownLexerSpy(() => {
      lexerCalls++
    })
    try {
      parseMarkdown('# Heading')
      expect(lexerCalls).toBe(1)
    } finally {
      setParseMarkdownLexerSpy(null)
    }
  })

  test('nested-fence input parses with the inner fence preserved as code content', () => {
    resetParseMarkdownCache()
    const input = '```md\n```ts\nconst x = 1\n```\n```'
    const out = parseMarkdown(input)
    // Should be a single code block whose body contains the inner fence.
    expect(out.length).toBe(1)
    expect(out[0].kind).toBe('code')
    if (out[0].kind === 'code') {
      // The body must include all three lines of the inner fence verbatim.
      expect(out[0].text).toContain('```ts')
      expect(out[0].text).toContain('const x = 1')
      // The last line of the inner block (the inner ```) should be present
      // inside the body, not consumed as the outer close.
      const lines = out[0].text.split('\n')
      expect(lines[lines.length - 1]).toBe('```')
    }
  })

  test('cache key is content-sensitive — different input lexes again', () => {
    resetParseMarkdownCache()
    parseMarkdown('# A')
    expect(getParseMarkdownCacheSize()).toBe(1)
    parseMarkdown('# B')
    expect(getParseMarkdownCacheSize()).toBe(2)
  })

  test('existing single-fence behaviour is unchanged', () => {
    resetParseMarkdownCache()
    const out: Block[] = parseMarkdown('```ts\nconst x = 1\n```')
    expect(out).toEqual([{ kind: 'code', lang: 'ts', text: 'const x = 1' }])
  })
})
