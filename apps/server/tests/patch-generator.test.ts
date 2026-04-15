import { describe, test, expect, mock, beforeEach } from 'bun:test'

let generateObjectResult: { object: unknown; usage: unknown } | null = null
let generateObjectShouldFail = false

mock.module('../src/config', () => ({
  config: {
    github: { token: 'ghp_test', webhook_secret: 'test', repos: [] },
    llm: { api_key: 'sk-or-test', model: 'anthropic/claude-sonnet-4-5' },
  },
}))

mock.module('ai', () => ({
  generateObject: async (_opts: { system?: string }) => {
    if (generateObjectShouldFail) throw new Error('LLM error')
    return generateObjectResult ?? { object: { patches: [] }, usage: null }
  },
}))

mock.module('../src/agent/llm', () => ({
  createModel: () => ({ modelId: 'anthropic/claude-sonnet-4-5' }),
}))

const { generatePatches } = await import('../src/agent/patch-generator')

beforeEach(() => {
  generateObjectResult = null
  generateObjectShouldFail = false
})

describe('generatePatches', () => {
  test('generates patches for actionable failure type', async () => {
    generateObjectResult = {
      object: {
        patches: [{ path: 'src/auth.ts', action: 'modify', content: 'fixed code' }],
      },
      usage: { promptTokens: 50, completionTokens: 25 },
    }

    const result = await generatePatches(
      {
        failureType: 'code_bug',
        summary: 'test',
        rootCause: 'bug',
        suggestedFix: 'fix it',
        confidence: 0.9,
        similarIncidentId: null,
      },
      [{ role: 'user', content: 'investigation data' }],
    )

    expect(result.generated).toBe(true)
    expect(result.patchJson).toBeDefined()
    const parsed = JSON.parse(result.patchJson!)
    expect(parsed.patches).toHaveLength(1)
    expect(parsed.patches[0].path).toBe('src/auth.ts')
  })

  test('skips for non-actionable failure type', async () => {
    const result = await generatePatches(
      {
        failureType: 'flaky_test',
        summary: 'test',
        rootCause: 'flaky',
        suggestedFix: 'retry',
        confidence: 0.9,
        similarIncidentId: null,
      },
      [],
    )

    expect(result.generated).toBe(false)
    expect(result.patchJson).toBeNull()
  })

  test('returns no patches when LLM returns empty array', async () => {
    generateObjectResult = { object: { patches: [] }, usage: null }

    const result = await generatePatches(
      {
        failureType: 'code_bug',
        summary: 'test',
        rootCause: 'bug',
        suggestedFix: 'fix',
        confidence: 0.8,
        similarIncidentId: null,
      },
      [],
    )

    expect(result.generated).toBe(false)
    expect(result.patchJson).toBeNull()
  })

  test('returns no patches when LLM call fails', async () => {
    generateObjectShouldFail = true

    const result = await generatePatches(
      {
        failureType: 'code_bug',
        summary: 'test',
        rootCause: 'bug',
        suggestedFix: 'fix',
        confidence: 0.8,
        similarIncidentId: null,
      },
      [],
    )

    expect(result.generated).toBe(false)
    expect(result.patchJson).toBeNull()
  })
})
