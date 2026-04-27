import { describe, expect, test } from 'bun:test'
import { isKnownModel } from '../src/runtime/model-availability'

describe('isKnownModel', () => {
  test('accepts current claude variants', () => {
    expect(isKnownModel('claude-opus-4-7')).toBe(true)
    expect(isKnownModel('claude-sonnet-4-6')).toBe(true)
    expect(isKnownModel('claude-haiku-4-5-20251001')).toBe(true)
    expect(isKnownModel('claude-opus-4-20250514')).toBe(true)
  })

  test('accepts openai variants', () => {
    expect(isKnownModel('gpt-4o')).toBe(true)
    expect(isKnownModel('gpt-4-turbo')).toBe(true)
    expect(isKnownModel('o1-mini')).toBe(true)
  })

  test('accepts gemini, grok, qwen', () => {
    expect(isKnownModel('gemini-2.0-flash')).toBe(true)
    expect(isKnownModel('grok-3')).toBe(true)
    expect(isKnownModel('grok-3-mini')).toBe(true)
    expect(isKnownModel('qwen-2.5-72b')).toBe(true)
  })

  test('rejects bare aliases (those should already have been resolved)', () => {
    expect(isKnownModel('opus')).toBe(false)
    expect(isKnownModel('sonnet')).toBe(false)
    expect(isKnownModel('claude')).toBe(false)
  })

  test('rejects empty / garbage', () => {
    expect(isKnownModel('')).toBe(false)
    expect(isKnownModel('   ')).toBe(false)
    expect(isKnownModel('totally-fake-model')).toBe(false)
    expect(isKnownModel('typo-claude-opus')).toBe(false)
  })
})
