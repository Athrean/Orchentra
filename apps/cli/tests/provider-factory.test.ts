import { describe, expect, test } from 'bun:test'

import { createProvider, resolveModelAlias, thinkingTokenBudgetForEffort } from '../src/provider-factory'

describe('provider factory', () => {
  test.each([
    ['opus', 'claude-opus-4-7', 'anthropic'],
    ['gpt-5', 'gpt-5', 'openai'],
    ['grok-3-mini', 'grok-3-mini', 'xai'],
    ['qwen-max', 'qwen-max', 'dashscope'],
    ['gemini-flash', 'gemini-2.0-flash', 'gemini'],
    ['ollama/llama3', 'ollama/llama3', 'local'],
    ['ollama/qwen2.5-coder:7b', 'ollama/qwen2.5-coder:7b', 'local'],
  ])('resolves %s to model %s on %s', (raw, expectedModel, expectedProviderName) => {
    const model = resolveModelAlias(raw)
    const resolved = createProvider(model)

    expect(model).toBe(expectedModel)
    expect(resolved.providerName).toBe(expectedProviderName)
  })

  test('user aliases win over builtin aliases', () => {
    expect(resolveModelAlias('opus', { opus: 'custom-opus' })).toBe('custom-opus')
  })

  test('maps effort tiers to provider thinking budgets', () => {
    expect(thinkingTokenBudgetForEffort('low')).toBe(1024)
    expect(thinkingTokenBudgetForEffort('medium')).toBe(4096)
    expect(thinkingTokenBudgetForEffort('high')).toBe(8192)
    expect(thinkingTokenBudgetForEffort('xhigh')).toBe(16384)
    expect(thinkingTokenBudgetForEffort('max')).toBe(32768)
  })
})
