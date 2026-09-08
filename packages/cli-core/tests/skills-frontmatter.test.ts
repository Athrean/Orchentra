import { describe, expect, test } from 'bun:test'
import { parseFrontmatter } from '../src/runtime/skills/frontmatter'

describe('parseFrontmatter', () => {
  test('extracts meta and body from a simple SKILL.md', () => {
    const input = ['---', 'name: hello', 'description: say hi', '---', '', 'Hello world.', ''].join('\n')

    const result = parseFrontmatter(input)

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.meta).toEqual({ name: 'hello', description: 'say hi' })
    expect(result.body.trim()).toBe('Hello world.')
  })

  test('errors when opening --- fence is missing', () => {
    const result = parseFrontmatter('name: hello\n---\nbody')
    expect(result.kind).toBe('error')
    if (result.kind !== 'error') return
    expect(result.message).toContain('opening')
  })

  test('errors when closing --- fence is missing', () => {
    const result = parseFrontmatter('---\nname: hello\nbody never closes')
    expect(result.kind).toBe('error')
    if (result.kind !== 'error') return
    expect(result.message).toContain('closing')
  })

  test('parses inline array values as string arrays', () => {
    const input = ['---', 'name: deploy', 'allowed-tools: [Bash(kubectl *), Bash(helm *)]', '---', 'body'].join('\n')

    const result = parseFrontmatter(input)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.meta['allowed-tools']).toEqual(['Bash(kubectl *)', 'Bash(helm *)'])
  })
})

// ── Real-world SKILL.md frontmatter ────────────────────────────────────────
// Regression: every globally installed skill failed to load with
// `invalid frontmatter line: '  MUST USE when user wants to …'`. Published
// skills almost all use a folded `description: >` whose text continues on
// indented lines, which the line-at-a-time reader rejected outright when the
// continuation had no colon — and silently turned into a junk key when it did.

describe('parseFrontmatter block scalars', () => {
  test('folds a `>` description into one line', () => {
    const input = [
      '---',
      'name: agent-reach',
      'description: >',
      '  MUST USE when the user wants to research anything',
      '  on the internet.',
      '---',
      'body',
    ].join('\n')

    const result = parseFrontmatter(input)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.meta['description']).toBe('MUST USE when the user wants to research anything on the internet.')
    expect(result.meta['name']).toBe('agent-reach')
  })

  test('a blank line inside a folded block is a paragraph break', () => {
    const input = ['---', 'description: >', '  first para', '', '  second para', '---', ''].join('\n')
    const result = parseFrontmatter(input)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.meta['description']).toBe('first para\n\nsecond para')
  })

  test('a `|` block keeps its line breaks', () => {
    const input = ['---', 'description: |', '  line one', '  line two', '---', ''].join('\n')
    const result = parseFrontmatter(input)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.meta['description']).toBe('line one\nline two')
  })

  test('a colon inside continuation prose is text, not a new key', () => {
    const input = ['---', 'name: x', 'description: >', '  doctrine: evidence before opinion', '---', ''].join('\n')
    const result = parseFrontmatter(input)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.meta['description']).toBe('doctrine: evidence before opinion')
    expect(Object.keys(result.meta)).toEqual(['name', 'description'])
  })

  test('reads a block sequence under a bare key', () => {
    const input = ['---', 'allowed-tools:', '  - Bash(git *)', '  - Read', '---', ''].join('\n')
    const result = parseFrontmatter(input)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.meta['allowed-tools']).toEqual(['Bash(git *)', 'Read'])
  })

  test('strips quotes from a scalar', () => {
    const result = parseFrontmatter(['---', 'name: "hello"', '---', ''].join('\n'))
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.meta['name']).toBe('hello')
  })

  test('still rejects a line that is neither a key nor a continuation', () => {
    const result = parseFrontmatter(['---', 'name: x', 'garbage', '---', ''].join('\n'))
    expect(result.kind).toBe('error')
  })
})
