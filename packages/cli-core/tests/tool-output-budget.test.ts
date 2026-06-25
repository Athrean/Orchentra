import { describe, expect, test } from 'bun:test'
import { budgetToolOutput } from '../src/runtime/tool-output-budget'

describe('budgetToolOutput', () => {
  test('returns content untouched when within budget', () => {
    const r = budgetToolOutput('short', 100)
    expect(r.trimmed).toBe(false)
    expect(r.content).toBe('short')
    expect(r.originalChars).toBe(5)
    expect(r.keptChars).toBe(5)
  })

  test('is a no-op when budget is 0 or negative (disabled)', () => {
    const big = 'x'.repeat(10_000)
    expect(budgetToolOutput(big, 0).trimmed).toBe(false)
    expect(budgetToolOutput(big, -1).trimmed).toBe(false)
  })

  test('keeps head and tail and drops the middle when over budget', () => {
    const content = 'H'.repeat(50) + 'M'.repeat(900) + 'T'.repeat(50)
    const r = budgetToolOutput(content, 100)
    expect(r.trimmed).toBe(true)
    expect(r.originalChars).toBe(1000)
    expect(r.keptChars).toBe(100)
    expect(r.content.startsWith('H')).toBe(true)
    expect(r.content.endsWith('T')).toBe(true)
    expect(r.content).not.toContain('M'.repeat(900))
    expect(r.content).toContain('trimmed') // visible marker for the model
  })

  test('reports dropped chars as original minus kept', () => {
    const r = budgetToolOutput('a'.repeat(1000), 200)
    expect(r.originalChars - r.keptChars).toBe(800)
  })
})
