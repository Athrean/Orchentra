import { describe, expect, test } from 'bun:test'

import { createProvider, resolveModelAlias, thinkingTokenBudgetForEffort } from '../src/provider-factory'

describe('provider factory', () => {
  test.each([
    ['opus', 'claude-opus-4-8', 'anthropic'],
    ['gpt-5.5', 'gpt-5.5', 'openai'],
    ['grok', 'grok-4.3', 'xai'],
    ['qwen-max', 'qwen-max', 'dashscope'],
    ['qwen', 'qwen/qwen3.6-35b-a3b', 'openrouter'],
    ['gemini-pro', 'gemini-3.1-pro-preview', 'gemini'],
    ['glm', 'z-ai/glm-5.2', 'openrouter'],
    ['mistral', 'mistralai/mistral-medium-3-5', 'openrouter'],
    ['deepseek', 'deepseek/deepseek-v4-pro', 'openrouter'],
    ['gpt-oss', 'openai/gpt-oss-120b', 'openrouter'],
    ['gpt-oss-local', 'ollama/gpt-oss:120b', 'local'],
    ['ollama/llama3', 'ollama/llama3', 'local'],
    ['ollama/qwen2.5-coder:7b', 'ollama/qwen2.5-coder:7b', 'local'],
    ['openai/gpt-oss-120b', 'openai/gpt-oss-120b', 'openrouter'],
    ['z-ai/glm-5.2', 'z-ai/glm-5.2', 'openrouter'],
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
