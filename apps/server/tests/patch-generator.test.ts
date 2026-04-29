import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { spawnFakeOpenRouter } from './fakes/openrouter-server'

const fake = await spawnFakeOpenRouter()

mock.module('../src/config', () => ({
  config: {
    github: { token: 'ghp_test', webhook_secret: 'test', repos: [] },
    llm: {
      api_key: 'sk-or-test',
      model: 'anthropic/claude-sonnet-4-5',
      base_url: fake.baseUrl,
    },
  },
}))

const { generatePatches } = await import('../src/agent/patch-generator')

afterAll(async () => {
  await fake.shutdown()
})

beforeEach(() => {
  fake.requests.length = 0
  fake.setScenario({})
})

describe('generatePatches', () => {
  test('generates patches for actionable failure type', async () => {
    fake.setScenario({
      responses: [
        {
          toolCalls: [
            {
              name: 'json',
              args: { patches: [{ path: 'src/auth.ts', action: 'modify', content: 'fixed code' }] },
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 25 },
        },
      ],
    })

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
    expect(fake.requests).toHaveLength(0)
  })

  test('skips for low-confidence brief', async () => {
    const result = await generatePatches(
      {
        failureType: 'code_bug',
        summary: 'test',
        rootCause: 'bug',
        suggestedFix: 'fix',
        confidence: 0.5,
        similarIncidentId: null,
      },
      [],
    )

    expect(result.generated).toBe(false)
    expect(result.patchJson).toBeNull()
    expect(fake.requests).toHaveLength(0)
  })

  test('returns no patches when LLM returns empty array', async () => {
    fake.setScenario({
      responses: [{ toolCalls: [{ name: 'json', args: { patches: [] } }] }],
    })

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
    fake.setScenario({
      responses: [{ httpStatus: 500, httpBody: { error: { message: 'LLM error' } } }],
    })

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
