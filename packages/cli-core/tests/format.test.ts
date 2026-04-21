import { test, expect, describe } from 'bun:test'
import { formatPatternContext } from '../src/memory/format'
import type { PatternMatch } from '../src/memory/types'

describe('formatPatternContext', () => {
  test('returns empty string for empty matches', () => {
    // given — no matches
    // when — formatting pattern context
    // then — returns empty string
    expect(formatPatternContext([])).toBe('')
  })

  test('formats single match', () => {
    // given — a single match with known fields
    const matches: PatternMatch[] = [
      {
        entry: {
          id: 'e1',
          orgId: 'org-1',
          incidentId: 'inc-1',
          embedding: [0.1],
          pattern: 'workflow: ci\nroot_cause: timeout',
          resolution: 'increase timeout to 5m',
          failureType: 'infra_timeout',
          usageCount: 1,
          lastMatchedAt: '2026-04-21T00:00:00Z',
          createdAt: '2026-04-20T00:00:00Z',
        },
        similarity: 0.871,
      },
    ]

    // when — formatting pattern context
    const result = formatPatternContext(matches)

    // then — output contains header, similarity percentage, and entry details
    expect(result).toContain('## Similar Past Incidents')
    expect(result).toContain('### Match (87% similar)')
    expect(result).toContain('**Failure pattern:** workflow: ci')
    expect(result).toContain('**Resolution:** increase timeout to 5m')
    expect(result).toContain('**Failure type:** infra_timeout')
  })

  test('formats multiple matches', () => {
    // given — two matches with different similarity scores
    const matches: PatternMatch[] = [
      {
        entry: {
          id: 'e1',
          orgId: 'org-1',
          incidentId: null,
          embedding: [],
          pattern: 'first',
          resolution: 'fix1',
          failureType: 'code_bug',
          usageCount: 0,
          lastMatchedAt: null,
          createdAt: '',
        },
        similarity: 0.95,
      },
      {
        entry: {
          id: 'e2',
          orgId: 'org-1',
          incidentId: null,
          embedding: [],
          pattern: 'second',
          resolution: 'fix2',
          failureType: 'flaky_test',
          usageCount: 0,
          lastMatchedAt: null,
          createdAt: '',
        },
        similarity: 0.82,
      },
    ]

    // when — formatting pattern context
    const result = formatPatternContext(matches)

    // then — output contains both matches with their percentages
    expect(result).toContain('### Match (95% similar)')
    expect(result).toContain('### Match (82% similar)')
    expect(result).toContain('first')
    expect(result).toContain('second')
  })
})
