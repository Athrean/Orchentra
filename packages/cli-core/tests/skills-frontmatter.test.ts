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
