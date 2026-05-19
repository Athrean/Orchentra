import { describe, expect, test } from 'bun:test'
import { expandSpec } from '../src/commands/expand-spec'

describe('expandSpec', () => {
  test('passes a fully-qualified owner/repo#runId through unchanged', () => {
    expect(expandSpec('acme/api#42', 'other/x')).toBe('acme/api#42')
  })

  test('passes a fully-qualified owner/repo through unchanged', () => {
    expect(expandSpec('acme/api', 'other/x')).toBe('acme/api')
  })

  test('prepends activeRepo to a leading-# run id', () => {
    expect(expandSpec('#42', 'acme/api')).toBe('acme/api#42')
  })

  test('prepends activeRepo to a bare numeric run id', () => {
    expect(expandSpec('42', 'acme/api')).toBe('acme/api#42')
  })

  test('returns activeRepo when the input is empty', () => {
    expect(expandSpec(undefined, 'acme/api')).toBe('acme/api')
    expect(expandSpec('', 'acme/api')).toBe('acme/api')
  })

  test('returns null when activeRepo is missing and the input needs it', () => {
    expect(expandSpec('#42', null)).toBeNull()
    expect(expandSpec('42', null)).toBeNull()
    expect(expandSpec(undefined, null)).toBeNull()
  })

  test('returns malformed input unchanged so the caller can produce a useful error', () => {
    expect(expandSpec('garbage', 'acme/api')).toBe('garbage')
    expect(expandSpec('owner-only', null)).toBe('owner-only')
  })
})
