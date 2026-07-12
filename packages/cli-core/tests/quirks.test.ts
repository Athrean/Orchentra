import { describe, expect, test } from 'bun:test'
import { QuirkCounters } from '../src/runtime/quirks'

describe('QuirkCounters', () => {
  test('counts start at zero and increment per model + kind', () => {
    const quirks = new QuirkCounters()
    expect(quirks.count('claude-sonnet-5', 'malformed_args')).toBe(0)

    quirks.record('claude-sonnet-5', 'malformed_args')
    quirks.record('claude-sonnet-5', 'malformed_args')
    quirks.record('claude-sonnet-5', 'unknown_tool')
    quirks.record('claude-haiku-4-5', 'malformed_args')

    expect(quirks.count('claude-sonnet-5', 'malformed_args')).toBe(2)
    expect(quirks.count('claude-sonnet-5', 'unknown_tool')).toBe(1)
    expect(quirks.count('claude-haiku-4-5', 'malformed_args')).toBe(1)
    expect(quirks.count('claude-haiku-4-5', 'unknown_tool')).toBe(0)
  })

  test('snapshot returns a plain object keyed model → kind → count', () => {
    const quirks = new QuirkCounters()
    quirks.record('m1', 'unknown_tool')
    quirks.record('m1', 'unknown_tool')
    quirks.record('m2', 'provider_error')

    expect(quirks.snapshot()).toEqual({
      m1: { unknown_tool: 2 },
      m2: { provider_error: 1 },
    })
  })

  test('empty counters snapshot to an empty object', () => {
    expect(new QuirkCounters().snapshot()).toEqual({})
  })
})
