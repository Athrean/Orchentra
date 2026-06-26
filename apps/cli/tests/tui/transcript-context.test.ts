import { describe, expect, test } from 'bun:test'

import { planNeedFromTranscript } from '../../src/tui/transcript-context'
import type { TranscriptRow } from '../../src/tui/types'

describe('planNeedFromTranscript', () => {
  test('builds compact plan context from user and assistant rows', () => {
    const rows: TranscriptRow[] = [
      { kind: 'user', id: 'u1', text: 'Add retry handling to provider calls' },
      { kind: 'assistant', id: 'a1', text: 'The retry should stay inside cli-api.' },
      { kind: 'user', id: 'u2', text: '/plan' },
    ]

    const need = planNeedFromTranscript(rows)

    expect(need).toContain('Recent transcript context:')
    expect(need).toContain('User: Add retry handling to provider calls')
    expect(need).toContain('Assistant: The retry should stay inside cli-api.')
    expect(need).not.toContain('/plan')
  })

  test('returns null when only command rows are available', () => {
    const rows: TranscriptRow[] = [{ kind: 'user', id: 'u1', text: '/plan' }]

    expect(planNeedFromTranscript(rows)).toBeNull()
  })

  test('caps oversized transcript context', () => {
    const rows: TranscriptRow[] = [
      { kind: 'user', id: 'u1', text: 'Build a focused importer' },
      { kind: 'assistant', id: 'a1', text: 'x'.repeat(7000) },
    ]

    const need = planNeedFromTranscript(rows)

    expect(need?.length).toBeLessThan(6200)
    expect(need).toContain('...truncated...')
  })
})
