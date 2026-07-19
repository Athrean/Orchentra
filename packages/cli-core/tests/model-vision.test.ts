import { describe, expect, test } from 'bun:test'
import {
  modelSupportsVision,
  profileFor,
  MODEL_PROFILES,
  validateProfileDivergences,
} from '../src/runtime/model-profile'

describe('modelSupportsVision', () => {
  test.each([
    ['claude-fable-5', true],
    ['claude-opus-4-8', true],
    ['gpt-5', true],
    ['gemini-2.0-flash', true],
    ['grok-4', true],
    ['anthropic/claude-3.5-sonnet', true], // OpenRouter-routed still resolves the claude family
    ['google/gemini-2.0-flash', true],
    ['ollama/llama3', false], // local text model — not known vision-capable
    ['deepseek-chat', false],
    ['some-unknown-model', false],
  ])('%s → vision %s', (model, expected) => {
    expect(modelSupportsVision(model)).toBe(expected)
  })

  test('vision capability survives generic profile mode (it is plumbing, not a divergence)', () => {
    // Generic mode strips justified specializations, but a factual capability
    // like vision must survive — else image sends would break under the A/B toggle.
    expect(modelSupportsVision('claude-fable-5', 'generic')).toBe(true)
    expect(profileFor('claude-fable-5', 'generic').vision).toBe(true)
  })

  test('the vision flag does not require a counter-backed divergence entry', () => {
    // Registry must still pass the justification bar with vision flags present.
    expect(validateProfileDivergences(MODEL_PROFILES, {})).toEqual([])
  })
})
