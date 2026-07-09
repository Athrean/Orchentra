import { describe, expect, test } from 'bun:test'
import { isKnownModel } from '../src/runtime/model-availability'

describe('isKnownModel', () => {
  test('accepts current claude variants', () => {
    expect(isKnownModel('claude-fable-5')).toBe(true)
    expect(isKnownModel('claude-opus-4-8')).toBe(true)
    expect(isKnownModel('claude-opus-4-7')).toBe(true)
    expect(isKnownModel('claude-sonnet-4-6')).toBe(true)
    expect(isKnownModel('claude-haiku-4-5-20251001')).toBe(true)
    expect(isKnownModel('claude-opus-4-20250514')).toBe(true)
  })

  test('accepts openai variants', () => {
    expect(isKnownModel('gpt-5.5')).toBe(true)
    expect(isKnownModel('gpt-5.4-mini')).toBe(true)
    expect(isKnownModel('openai/gpt-oss-120b')).toBe(true)
    expect(isKnownModel('gpt-4o')).toBe(true)
    expect(isKnownModel('gpt-4-turbo')).toBe(true)
    expect(isKnownModel('o1-mini')).toBe(true)
  })

  test('accepts gemini, grok, qwen', () => {
    expect(isKnownModel('gemini-3.1-pro-preview')).toBe(true)
    expect(isKnownModel('grok-4.3')).toBe(true)
    expect(isKnownModel('qwen/qwen3.6-35b-a3b')).toBe(true)
    expect(isKnownModel('gemini-2.0-flash')).toBe(true)
    expect(isKnownModel('grok-3')).toBe(true)
    expect(isKnownModel('grok-3-mini')).toBe(true)
    expect(isKnownModel('qwen-2.5-72b')).toBe(true)
  })

  test('accepts ollama-prefixed local models', () => {
    expect(isKnownModel('ollama/llama3')).toBe(true)
    expect(isKnownModel('ollama/qwen2.5-coder:7b')).toBe(true)
    expect(isKnownModel('ollama/gpt-oss:120b')).toBe(true)
  })

  test('accepts OpenRouter-hosted frontier families', () => {
    expect(isKnownModel('z-ai/glm-5.2')).toBe(true)
    expect(isKnownModel('mistralai/mistral-medium-3-5')).toBe(true)
    expect(isKnownModel('deepseek/deepseek-v4-pro')).toBe(true)
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
