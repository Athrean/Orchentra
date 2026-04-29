import { describe, expect, test } from 'bun:test'
import { parseMarkdown } from '../src/tui/markdown/parse'
import { tokenizeInline } from '../src/tui/markdown/inline'

describe('parseMarkdown', () => {
  test('extracts a fenced code block with language', () => {
    const out = parseMarkdown('```ts\nconst x = 1\n```')
    expect(out).toEqual([{ kind: 'code', lang: 'ts', text: 'const x = 1' }])
  })

  test('parses ATX headers at level 1-6', () => {
    const out = parseMarkdown('# H1\n## H2\n### H3')
    expect(out.map((b) => b.kind)).toEqual(['heading', 'heading', 'heading'])
    if (out[0].kind === 'heading' && out[2].kind === 'heading') {
      expect(out[0].level).toBe(1)
      expect(out[2].level).toBe(3)
    }
  })

  test('groups bullet items into a single list block', () => {
    const out = parseMarkdown('- one\n- two\n- three')
    expect(out.length).toBe(1)
    if (out[0].kind === 'list') {
      expect(out[0].ordered).toBe(false)
      expect(out[0].items).toEqual(['one', 'two', 'three'])
    }
  })

  test('treats numeric prefixes as an ordered list', () => {
    const out = parseMarkdown('1. one\n2. two')
    if (out[0].kind === 'list') {
      expect(out[0].ordered).toBe(true)
    }
  })

  test('blockquote consumes contiguous > lines', () => {
    const out = parseMarkdown('> a\n> b\n\nparagraph')
    expect(out.map((b) => b.kind)).toEqual(['quote', 'paragraph'])
    if (out[0].kind === 'quote') expect(out[0].text).toBe('a\nb')
  })

  test('paragraphs split on blank lines and special blocks', () => {
    const out = parseMarkdown('first\nline\n\nsecond')
    expect(out.length).toBe(2)
    if (out[0].kind === 'paragraph') expect(out[0].text).toBe('first\nline')
  })
})

describe('tokenizeInline', () => {
  test('extracts inline code spans', () => {
    expect(tokenizeInline('use `foo` here')).toEqual([
      { kind: 'text', value: 'use ' },
      { kind: 'code', value: 'foo' },
      { kind: 'text', value: ' here' },
    ])
  })

  test('extracts bold and leaves punctuation alone', () => {
    expect(tokenizeInline('a **bold** word')).toEqual([
      { kind: 'text', value: 'a ' },
      { kind: 'bold', value: 'bold' },
      { kind: 'text', value: ' word' },
    ])
  })

  test('does not split on stray asterisks adjacent to whitespace', () => {
    const tokens = tokenizeInline('star * lonely')
    expect(tokens.every((t) => t.kind === 'text')).toBe(true)
  })

  test('returns plain text when no markers are present', () => {
    expect(tokenizeInline('hello world')).toEqual([{ kind: 'text', value: 'hello world' }])
  })
})
