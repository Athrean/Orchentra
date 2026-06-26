import { describe, expect, test } from 'bun:test'
import type { PatternEntry } from '@orchentra/cli-core'
import { formatMemoryFeedbackGuidance } from '../src/composites/memory-guidance'

function makeEntry(id: string, over: Partial<PatternEntry> = {}): PatternEntry {
  return {
    id,
    orgId: 'default',
    incidentId: null,
    embedding: [],
    pattern: 'default pattern',
    resolution: 'default resolution',
    failureType: 'code_bug',
    usageCount: 0,
    lastMatchedAt: null,
    createdAt: '2026-06-26T00:00:00.000Z',
    ...over,
  }
}

describe('formatMemoryFeedbackGuidance', () => {
  test('formats accepted and rejected memories while excluding unmarked memories', () => {
    const text = formatMemoryFeedbackGuidance([
      makeEntry('accepted-1', {
        feedback: 'accepted',
        feedbackAt: '2026-06-26T02:00:00.000Z',
        pattern: 'prefer small parser helpers',
        resolution: 'reuse the parser helper',
      }),
      makeEntry('rejected-1', {
        feedback: 'rejected',
        feedbackAt: '2026-06-26T01:00:00.000Z',
        pattern: 'avoid broad string replacement',
        resolution: 'use structured parsing instead',
      }),
      makeEntry('unmarked-1', {
        pattern: 'unmarked memory should not enter prompts',
      }),
    ])

    expect(text).toContain('Local Feedback Memory')
    expect(text).toContain('Accepted patterns')
    expect(text).toContain('prefer small parser helpers')
    expect(text).toContain('reuse the parser helper')
    expect(text).toContain('Rejected patterns')
    expect(text).toContain('avoid broad string replacement')
    expect(text).toContain('use structured parsing instead')
    expect(text).not.toContain('unmarked memory')
  })

  test('caps entries per feedback kind and keeps the newest feedback first', () => {
    const text = formatMemoryFeedbackGuidance(
      [
        makeEntry('old-accepted', {
          feedback: 'accepted',
          feedbackAt: '2026-06-26T01:00:00.000Z',
          pattern: 'old accepted pattern',
        }),
        makeEntry('new-accepted', {
          feedback: 'accepted',
          feedbackAt: '2026-06-26T03:00:00.000Z',
          pattern: 'new accepted pattern',
        }),
      ],
      { maxPerKind: 1 },
    )

    expect(text).toContain('new accepted pattern')
    expect(text).not.toContain('old accepted pattern')
  })
})
