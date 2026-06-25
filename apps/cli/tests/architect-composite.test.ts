import { describe, expect, test } from 'bun:test'
import { architect, type ArchitectPlan } from '../src/composites/architect'
import type { LlmCaller } from '../src/composites/scan'

const cannedPlan = {
  recommendedStack: 'token-bucket in cli-tools',
  rationale: 'fewest moving parts; no new dep',
  alternatives: [
    { name: 'sliding-window', tradeoff: 'more accurate, more state' },
    { name: 'leaky-bucket', tradeoff: 'smooths bursts, harder to reason about' },
  ],
  architecture: 'one module, pure function, injected clock',
  scaffold: [{ path: 'packages/cli-tools/src/rate-limit.ts', purpose: 'the limiter' }],
  verification: ['unit test the refill math'],
}

function fakeLlm(text: string): { llm: LlmCaller; seenSystem: () => string } {
  let system = ''
  const llm: LlmCaller = async ({ systemPrompt }) => {
    system = systemPrompt
    return { text, model: 'fake-model', tokensIn: 100, tokensOut: 50 }
  }
  return { llm, seenSystem: () => system }
}

describe('/plan architect composite', () => {
  test('parses a well-formed plan and carries usage', async () => {
    const { llm } = fakeLlm(JSON.stringify(cannedPlan))
    const r = (await architect({ need: 'add a rate limiter', llm })) as ArchitectPlan
    expect(r.recommendedStack).toBe('token-bucket in cli-tools')
    expect(r.alternatives).toHaveLength(2)
    expect(r.scaffold[0].path).toBe('packages/cli-tools/src/rate-limit.ts')
    expect(r.model).toBe('fake-model')
    expect(r.tokensIn).toBe(100)
    expect(r.tokensOut).toBe(50)
  })

  test('tolerates a ```json fenced response', async () => {
    const { llm } = fakeLlm('```json\n' + JSON.stringify(cannedPlan) + '\n```')
    const r = await architect({ need: 'x', llm })
    expect('error' in r).toBe(false)
  })

  test('returns an error on malformed JSON', async () => {
    const { llm } = fakeLlm('not json at all')
    const r = await architect({ need: 'x', llm })
    expect(r).toHaveProperty('error')
  })

  test('rejects an empty need without calling the model', async () => {
    let called = false
    const llm: LlmCaller = async () => {
      called = true
      return { text: '{}', model: 'm', tokensIn: 0, tokensOut: 0 }
    }
    const r = await architect({ need: '   ', llm })
    expect(r).toHaveProperty('error')
    expect(called).toBe(false)
  })

  test('injects the active terse-mode instruction into the system prompt', async () => {
    const { llm, seenSystem } = fakeLlm(JSON.stringify(cannedPlan))
    await architect({ need: 'x', llm, terseMode: 'full' })
    expect(seenSystem().toUpperCase()).toContain('TERSE OUTPUT MODE')
  })

  test('omits terse instruction when mode is off/unset', async () => {
    const { llm, seenSystem } = fakeLlm(JSON.stringify(cannedPlan))
    await architect({ need: 'x', llm })
    expect(seenSystem().toUpperCase()).not.toContain('TERSE OUTPUT MODE')
  })

  test('folds the plan-depth instruction into the system prompt', async () => {
    const { llm, seenSystem } = fakeLlm(JSON.stringify(cannedPlan))
    await architect({ need: 'x', llm, planLevel: 'max' })
    expect(seenSystem().toUpperCase()).toContain('PLAN DEPTH: MAX')
  })

  test('defaults to plus depth when no level is given', async () => {
    const { llm, seenSystem } = fakeLlm(JSON.stringify(cannedPlan))
    await architect({ need: 'x', llm })
    expect(seenSystem().toUpperCase()).toContain('PLAN DEPTH: PLUS')
  })
})
