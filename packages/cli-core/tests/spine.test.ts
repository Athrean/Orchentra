import { describe, expect, test } from 'bun:test'
import { spinePrompt } from '../src/runtime/spine'

describe('spinePrompt', () => {
  test('composes output, context-budget, and lean-code instructions with real controls', () => {
    const prompt = spinePrompt({
      terseMode: 'ultra',
      taskFocus: '/review verifier',
      budget: {
        warnCostUsd: 1,
        maxCostUsd: 5,
        toolOutputBudgetChars: 50000,
        compactionThreshold: 0.8,
        keepRecentOnCompact: 6,
      },
    })

    expect(prompt).toContain('Output discipline')
    expect(prompt).toContain('Context budget')
    expect(prompt).toContain('Lean code')
    expect(prompt).toContain('tool_output=50000 chars')
    expect(prompt).toContain('Task focus: /review verifier')
    expect(prompt).toContain('TERSE OUTPUT MODE')
  })
})
