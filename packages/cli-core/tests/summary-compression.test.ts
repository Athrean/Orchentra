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
    // Use only priority-0 and priority-3 lines to avoid short section
    // headers sneaking in under the char budget.
    const summary = [
      'Conversation summary:',
      '- Scope: 18 earlier messages compacted.',
      '- Current work: finish summary compression.',
      'Some background context about the project.',
      'More context about the testing approach.',
      'Additional notes about the implementation.',
    ].join('\n')

    // 2 priority-0 lines = 61 chars. 3rd priority-0 = 105 chars total (won't fit).
    // Priority-3 lines are all ~45 chars, also won't fit after 2 lines (61+1+45=107).
    // Omission notice (40 chars): 61 + 1 + 40 = 102 <= 104.
    const budget: SummaryCompressionBudget = {
      maxChars: 104,
      maxLines: 6,
      maxLineChars: 80,
    }

    const result = compressSummary(summary, budget)

    expect(result.omittedLines).toBeGreaterThan(0)
    expect(result.summary).toContain('additional line(s) omitted')
  })
})
