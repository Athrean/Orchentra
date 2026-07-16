import { describe, expect, test } from 'bun:test'
import {
  GENERIC_PROFILE,
  MODEL_PROFILES,
  activeProfileMode,
  isKnownModel,
  profileFor,
  validateProfileDivergences,
  type ModelProfile,
} from '../src/runtime/model-profile'

describe('profileFor — provider routing parity with the retired heuristics', () => {
  test.each([
    // model id → family, provider (mirrors the old resolveProviderName table)
    ['claude-fable-5', 'claude', 'anthropic'],
    ['claude-opus-4-8', 'claude', 'anthropic'],
    ['gpt-5.5', 'gpt', 'openai'],
    ['grok-4.3', 'grok', 'xai'],
    ['qwen-max', 'qwen', 'dashscope'],
    ['gemini-3.1-pro-preview', 'gemini', 'gemini'],
    ['ollama/gpt-oss:120b', 'local', 'local'],
    ['ollama/llama3', 'local', 'local'],
    ['anthropic/claude-sonnet-5', 'claude', 'openrouter'],
    ['openai/gpt-oss-120b', 'gpt', 'openrouter'],
    ['google/gemini-3.1-pro', 'gemini', 'openrouter'],
    ['x-ai/grok-4.3', 'grok', 'openrouter'],
    ['mistralai/mistral-medium-3-5', 'mistral', 'openrouter'],
    ['deepseek/deepseek-v4-pro', 'deepseek', 'openrouter'],
    ['qwen/qwen3.6-35b-a3b', 'qwen', 'openrouter'],
    ['z-ai/glm-5.2', 'glm', 'openrouter'],
    ['zhipu/glm-4', 'glm', 'openrouter'],
  ])('%s → family %s via %s', (model, family, provider) => {
    const profile = profileFor(model)
    expect(profile.family).toBe(family)
    expect(profile.provider).toBe(provider)
  })

  test('unmatched ids fall back to the generic profile (anthropic route)', () => {
    expect(profileFor('totally-fake-model')).toBe(GENERIC_PROFILE)
    expect(profileFor('totally-fake-model').provider).toBe('anthropic')
  })

  test('shipped registry carries zero divergences — v0.8.0 ships the bar, not tuning', () => {
    for (const p of MODEL_PROFILES) expect(p.divergences).toEqual([])
  })
})

describe('profile mode — the A/B toggle', () => {
  const diverged: ModelProfile = {
    family: 'gpt',
    match: [/^gpt/i],
    provider: 'openai',
    divergences: [
      { field: 'editDialect', quirk: 'malformed_args', observedCount: 7, evidence: 'traces/run-1/manifest.json' },
    ],
  }

  test('generic mode strips a diverged profile down to plumbing — family and route stay', () => {
    const profiled = profileFor('gpt-5.5', 'profiled', [diverged])
    expect(profiled.divergences).toHaveLength(1)

    const generic = profileFor('gpt-5.5', 'generic', [diverged])
    expect(generic.family).toBe('gpt')
    expect(generic.provider).toBe('openai')
    expect(generic.divergences).toEqual([])
  })

  test('activeProfileMode reads the env toggle, defaulting to profiled', () => {
    expect(activeProfileMode({})).toBe('profiled')
    expect(activeProfileMode({ ORCHENTRA_MODEL_PROFILES: 'generic' })).toBe('generic')
    expect(activeProfileMode({ ORCHENTRA_MODEL_PROFILES: 'anything-else' })).toBe('profiled')
  })
})

describe('validateProfileDivergences — the counter-justification bar', () => {
  const gptDiverged: ModelProfile = {
    family: 'gpt',
    match: [/^gpt/i],
    provider: 'openai',
    divergences: [
      { field: 'editDialect', quirk: 'malformed_args', observedCount: 7, evidence: 'traces/run-1/manifest.json' },
    ],
  }

  test('a divergence backed by recorded counters on a matching model passes', () => {
    const snapshot = { 'gpt-5.5': { malformed_args: 7 } }
    expect(validateProfileDivergences([gptDiverged], snapshot)).toEqual([])
  })

  test('a divergence with no recorded counts is rejected as a vibe', () => {
    const violations = validateProfileDivergences([gptDiverged], {})
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('malformed_args')
    expect(violations[0]).toContain('vibe')
  })

  test('counts on a model the profile does not match do not justify it', () => {
    const snapshot = { 'claude-fable-5': { malformed_args: 12 } }
    expect(validateProfileDivergences([gptDiverged], snapshot)).toHaveLength(1)
  })

  test('a divergence without an evidence reference is rejected outright', () => {
    const noEvidence: ModelProfile = {
      ...gptDiverged,
      divergences: [{ field: 'editDialect', quirk: 'malformed_args', observedCount: 7, evidence: '  ' }],
    }
    const violations = validateProfileDivergences([noEvidence], { 'gpt-5.5': { malformed_args: 7 } })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('no evidence reference')
  })

  test('the shipped registry passes the bar against an empty snapshot', () => {
    expect(validateProfileDivergences(MODEL_PROFILES, {})).toEqual([])
  })
})

describe('isKnownModel (folded in from model-availability)', () => {
  test('accepts current claude variants', () => {
    expect(isKnownModel('claude-fable-5')).toBe(true)
    expect(isKnownModel('claude-opus-4-8')).toBe(true)
    expect(isKnownModel('claude-haiku-4-5-20251001')).toBe(true)
  })

  test('accepts openai, gemini, grok, qwen, local variants', () => {
    expect(isKnownModel('gpt-5.5')).toBe(true)
    expect(isKnownModel('o1-mini')).toBe(true)
    expect(isKnownModel('openai/gpt-oss-120b')).toBe(true)
    expect(isKnownModel('gemini-3.1-pro-preview')).toBe(true)
    expect(isKnownModel('grok-4.3')).toBe(true)
    expect(isKnownModel('qwen/qwen3.6-35b-a3b')).toBe(true)
    expect(isKnownModel('ollama/qwen2.5-coder:7b')).toBe(true)
    expect(isKnownModel('z-ai/glm-5.2')).toBe(true)
    expect(isKnownModel('mistralai/mistral-medium-3-5')).toBe(true)
    expect(isKnownModel('deepseek/deepseek-v4-pro')).toBe(true)
  })

  test('rejects bare aliases and garbage', () => {
    expect(isKnownModel('opus')).toBe(false)
    expect(isKnownModel('claude')).toBe(false)
    expect(isKnownModel('')).toBe(false)
    expect(isKnownModel('   ')).toBe(false)
    expect(isKnownModel('totally-fake-model')).toBe(false)
    expect(isKnownModel('typo-claude-opus')).toBe(false)
  })
})
