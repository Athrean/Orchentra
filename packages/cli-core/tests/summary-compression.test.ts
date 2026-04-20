import { describe, expect, test } from 'bun:test'
import { compressSummary, compressSummaryText, defaultCompressionBudget } from '../src/runtime/summary-compression'
import type { SummaryCompressionBudget } from '../src/runtime/summary-compression'

describe('compressSummary', () => {
  test('collapses whitespace and deduplicates lines', () => {
    const summary =
      'Conversation summary:\n\n- Scope:   compact   earlier   messages.\n- Scope: compact earlier messages.\n- Current work: update runtime module.\n'

    const result = compressSummary(summary, defaultCompressionBudget)

    expect(result.removedDuplicateLines).toBe(1)
    expect(result.summary).toContain('- Scope: compact earlier messages.')
    expect(result.summary).not.toContain('  compact   earlier')
  })

  test('keeps core lines when budget is tight', () => {
    const budget: SummaryCompressionBudget = {
      maxChars: 120,
      maxLines: 3,
      maxLineChars: 80,
    }
    const summary = [
      'Conversation summary:',
      '- Scope: 18 earlier messages compacted.',
      '- Current work: finish summary compression.',
      '- Key timeline:',
      '  - user: asked for a working implementation.',
      '  - assistant: inspected runtime compaction flow.',
      '  - tool: cargo check succeeded.',
    ].join('\n')

    const result = compressSummary(summary, budget)

    expect(result.summary).toContain('Conversation summary:')
    expect(result.summary).toContain('- Scope: 18 earlier messages compacted.')
    expect(result.summary).toContain('- Current work: finish summary compression.')
    expect(result.omittedLines).toBeGreaterThan(0)
  })

  test('default text-only helper works', () => {
    const summary = 'Summary:\n\nA short line.'

    const compressed = compressSummaryText(summary)

    expect(compressed).toBe('Summary:\nA short line.')
  })

  test('truncates long lines to maxLineChars', () => {
    const longLine = 'A'.repeat(200)
    const budget: SummaryCompressionBudget = {
      maxChars: 500,
      maxLines: 10,
      maxLineChars: 50,
    }

    const result = compressSummary(longLine, budget)

    // The line should be truncated to 49 chars + ellipsis = 50 chars
    const outputLine = result.summary
    expect([...outputLine].length).toBe(50)
    expect(outputLine.endsWith('…')).toBe(true)
  })

  test('empty summary returns empty result', () => {
    const result = compressSummary('', defaultCompressionBudget)

    expect(result.summary).toBe('')
    expect(result.originalChars).toBe(0)
    expect(result.originalLines).toBe(1)
    expect(result.compressedChars).toBe(0)
    expect(result.compressedLines).toBe(0)
    expect(result.truncated).toBe(false)
  })

  test('omission notice added when lines are dropped', () => {
    // All priority-3 lines are 50+ chars so the char budget blocks them
    // while still fitting the omission notice (~40 chars).
    const summary = [
      'Conversation summary:',
      '- Scope: 18 earlier messages compacted.',
      '- Current work: finish summary compression.',
      'Some background context about the overall project architecture.',
      'More context about the testing approach and coverage goals.',
      'Additional notes about the implementation details to cover.',
    ].join('\n')

    // 2 priority-0 lines = 61 chars. Each priority-3 line >= 60 chars.
    // Adding any priority-3 line: 61 + 1 + 60 = 122. maxChars blocks at 103.
    // Omission notice (40 chars): 61 + 1 + 40 = 102 <= 103.
    const budget: SummaryCompressionBudget = {
      maxChars: 103,
      maxLines: 6,
      maxLineChars: 80,
    }

    const result = compressSummary(summary, budget)

    expect(result.omittedLines).toBeGreaterThan(0)
    expect(result.summary).toContain('additional line(s) omitted')
  })
})
