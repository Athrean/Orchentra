import { describe, expect, test } from 'bun:test'
import { parseRepoRunSpec, parseRepoSpec } from '../src/commands/spec'

describe('parseRepoRunSpec', () => {
  test('parses owner/repo#id', () => {
    expect(parseRepoRunSpec('acme/api#123')).toEqual({ owner: 'acme', repo: 'api', runId: 123 })
  })

  test('rejects missing run id', () => {
    expect(() => parseRepoRunSpec('acme/api')).toThrow()
  })

  test('rejects non-numeric run id', () => {
    expect(() => parseRepoRunSpec('acme/api#abc')).toThrow()
  })

  test('rejects zero run id', () => {
    expect(() => parseRepoRunSpec('acme/api#0')).toThrow()
  })

  test('trims whitespace', () => {
    expect(parseRepoRunSpec('  a/b#1  ')).toEqual({ owner: 'a', repo: 'b', runId: 1 })
  })
})

describe('parseRepoSpec', () => {
  test('parses owner/repo', () => {
    expect(parseRepoSpec('a/b')).toEqual({ owner: 'a', repo: 'b' })
  })

  test('rejects invalid', () => {
    expect(() => parseRepoSpec('not-a-repo')).toThrow()
  })
})
