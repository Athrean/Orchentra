import { describe, expect, test } from 'bun:test'
import type { MemoryStore, PatternEntry } from '@orchentra/cli-core'
import { applyReviewFeedback, parseReviewFeedbackComments } from '../src/composites/review-feedback'

function makeEntry(id: string): PatternEntry {
  return {
    id,
    orgId: 'default',
    incidentId: null,
    embedding: [],
    pattern: 'review found repeated null check',
    resolution: 'prefer shared guard',
    failureType: 'code_bug',
    usageCount: 0,
    lastMatchedAt: null,
    createdAt: '2026-06-26T00:00:00.000Z',
  }
}

class FakeStore implements MemoryStore {
  constructor(public entries: PatternEntry[]) {}
  save(_org: string, entry: PatternEntry): void {
    this.entries.push(entry)
  }
  load(): PatternEntry[] {
    return this.entries
  }
  updateUsage(): void {}
  updateUsageBatch(): void {}
  setFeedback(_org: string, id: string, feedback: 'accepted' | 'rejected', at = new Date()): void {
    this.entries = this.entries.map((entry) =>
      entry.id === id ? { ...entry, feedback, feedbackAt: at.toISOString() } : entry,
    )
  }
  delete(): void {}
  has(): boolean {
    return false
  }
}

describe('review feedback ingestion', () => {
  test('parses explicit feedback and memory-mark lines', () => {
    const markers = parseReviewFeedbackComments([
      {
        id: '1',
        url: 'https://example.test/1',
        body: 'not a marker\norchentra feedback: 11111111 accepted\n/memory mark 22222222 rejected',
      },
    ])

    expect(markers).toEqual([
      { memoryId: '11111111', feedback: 'accepted', source: 'https://example.test/1' },
      { memoryId: '22222222', feedback: 'rejected', source: 'https://example.test/1' },
    ])
  })

  test('applies exact and unique-prefix feedback', () => {
    const store = new FakeStore([
      makeEntry('11111111-1111-1111-1111-111111111111'),
      makeEntry('22222222-2222-2222-2222-222222222222'),
    ])

    const result = applyReviewFeedback(
      store,
      'default',
      [
        { memoryId: '11111111', feedback: 'accepted', source: 'issue' },
        { memoryId: '22222222-2222-2222-2222-222222222222', feedback: 'rejected', source: 'review' },
      ],
      () => new Date('2026-06-26T12:00:00.000Z'),
    )

    expect(result.applied).toHaveLength(2)
    expect(store.entries[0].feedback).toBe('accepted')
    expect(store.entries[0].feedbackAt).toBe('2026-06-26T12:00:00.000Z')
    expect(store.entries[1].feedback).toBe('rejected')
  })

  test('reports missing, ambiguous, and unsupported-store markers', () => {
    const store = new FakeStore([
      makeEntry('aaaa1111-0000-0000-0000-000000000000'),
      makeEntry('aaaa2222-0000-0000-0000-000000000000'),
    ])

    const result = applyReviewFeedback(store, 'default', [
      { memoryId: 'missing', feedback: 'accepted', source: 'issue' },
      { memoryId: 'aaaa', feedback: 'rejected', source: 'review' },
    ])

    expect(result.applied).toHaveLength(0)
    expect(result.missing).toHaveLength(1)
    expect(result.ambiguous).toEqual([{ memoryId: 'aaaa', feedback: 'rejected', source: 'review', matches: 2 }])

    const unsupported = applyReviewFeedback({ ...store, setFeedback: undefined }, 'default', [
      { memoryId: 'aaaa1111', feedback: 'accepted', source: 'issue' },
    ])
    expect(unsupported.ignored).toEqual([
      { memoryId: 'aaaa1111', feedback: 'accepted', source: 'issue', reason: 'unsupported-store' },
    ])
  })
})
