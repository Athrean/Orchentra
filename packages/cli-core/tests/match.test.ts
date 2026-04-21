import { test, expect, describe } from 'bun:test'
import { findSimilarPatterns } from '../src/memory/match'
import type { EmbedFn, MemoryConfig, MemoryStore, PatternEntry } from '../src/memory/types'

const defaultConfig: MemoryConfig = {
  embeddingModel: 'test-model',
  embeddingBaseUrl: 'http://localhost',
  similarityThreshold: 0.5,
  maxResults: 3,
}

function makeStore(entries: PatternEntry[]): MemoryStore {
  return {
    save(): void {},
    load(): PatternEntry[] {
      return entries
    },
    updateUsage(): void {},
    updateUsageBatch(): void {},
    delete(): void {},
    has(): boolean {
      return false
    },
  }
}

describe('findSimilarPatterns', () => {
  test('returns empty when store is empty', async () => {
    // given — an empty store
    const store = makeStore([])
    const embedFn: EmbedFn = async () => [1, 0, 0]

    // when — searching for similar patterns
    const results = await findSimilarPatterns(store, embedFn, defaultConfig, 'test', 'org-1')

    // then — returns empty array
    expect(results).toHaveLength(0)
  })

  test('returns matches above threshold', async () => {
    // given — a store with one entry and a query embedding above threshold
    const entries: PatternEntry[] = [
      {
        id: 'e1',
        orgId: 'org-1',
        incidentId: 'inc-1',
        embedding: [1, 0, 0],
        pattern: 'test pattern',
        resolution: 'test fix',
        failureType: 'code_bug',
        usageCount: 0,
        lastMatchedAt: null,
        createdAt: '2026-04-21T00:00:00Z',
      },
    ]
    const store = makeStore(entries)
    const embedFn: EmbedFn = async () => [0.9, 0.1, 0]

    // when — searching for similar patterns
    const results = await findSimilarPatterns(store, embedFn, defaultConfig, 'test', 'org-1')

    // then — returns matching entry with similarity above threshold
    expect(results).toHaveLength(1)
    expect(results[0].similarity).toBeGreaterThan(0.5)
  })

  test('filters out matches below threshold', async () => {
    // given — a store entry with an embedding far from the query
    const entries: PatternEntry[] = [
      {
        id: 'e1',
        orgId: 'org-1',
        incidentId: 'inc-1',
        embedding: [0, 1, 0],
        pattern: 'test',
        resolution: 'fix',
        failureType: 'unknown',
        usageCount: 0,
        lastMatchedAt: null,
        createdAt: '2026-04-21T00:00:00Z',
      },
    ]
    const store = makeStore(entries)
    const embedFn: EmbedFn = async () => [1, 0, 0]

    // when — searching for similar patterns
    const results = await findSimilarPatterns(store, embedFn, defaultConfig, 'test', 'org-1')

    // then — returns empty (orthogonal vectors, similarity ~ 0)
    expect(results).toHaveLength(0)
  })

  test('sorts by similarity descending', async () => {
    // given — two entries with different similarity scores
    const entries: PatternEntry[] = [
      {
        id: 'low',
        orgId: 'org-1',
        incidentId: 'inc-1',
        embedding: [0.6, 0.8, 0],
        pattern: 'low match',
        resolution: 'fix',
        failureType: 'unknown',
        usageCount: 0,
        lastMatchedAt: null,
        createdAt: '2026-04-21T00:00:00Z',
      },
      {
        id: 'high',
        orgId: 'org-1',
        incidentId: 'inc-2',
        embedding: [0.95, 0.05, 0],
        pattern: 'high match',
        resolution: 'fix',
        failureType: 'unknown',
        usageCount: 0,
        lastMatchedAt: null,
        createdAt: '2026-04-21T00:00:00Z',
      },
    ]
    const store = makeStore(entries)
    const embedFn: EmbedFn = async () => [1, 0, 0]

    // when — searching for similar patterns
    const results = await findSimilarPatterns(store, embedFn, defaultConfig, 'test', 'org-1')

    // then — results are sorted by similarity descending
    expect(results).toHaveLength(2)
    expect(results[0].entry.id).toBe('high')
    expect(results[1].entry.id).toBe('low')
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity)
  })

  test('respects limit parameter', async () => {
    // given — 10 entries all matching
    const entries: PatternEntry[] = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      orgId: 'org-1',
      incidentId: `inc-${i}`,
      embedding: [1, 0, 0],
      pattern: `pattern ${i}`,
      resolution: `fix ${i}`,
      failureType: 'unknown' as const,
      usageCount: 0,
      lastMatchedAt: null,
      createdAt: '2026-04-21T00:00:00Z',
    }))
    const store = makeStore(entries)
    const embedFn: EmbedFn = async () => [1, 0, 0]

    // when — searching with limit of 2
    const results = await findSimilarPatterns(store, embedFn, defaultConfig, 'test', 'org-1', 2)

    // then — only 2 results are returned
    expect(results).toHaveLength(2)
  })

  test('calls updateUsageBatch on matched entries', async () => {
    // given — a store that tracks updateUsageBatch calls
    const updatedIds: string[] = []
    const entries: PatternEntry[] = [
      {
        id: 'e1',
        orgId: 'org-1',
        incidentId: 'inc-1',
        embedding: [1, 0, 0],
        pattern: 'test',
        resolution: 'fix',
        failureType: 'unknown',
        usageCount: 0,
        lastMatchedAt: null,
        createdAt: '2026-04-21T00:00:00Z',
      },
    ]
    const store: MemoryStore = {
      save(): void {},
      load(): PatternEntry[] {
        return entries
      },
      updateUsage(_orgId: string, entryId: string): void {
        updatedIds.push(entryId)
      },
      updateUsageBatch(_orgId: string, entryIds: string[]): void {
        updatedIds.push(...entryIds)
      },
      delete(): void {},
      has(): boolean {
        return false
      },
    }
    const embedFn: EmbedFn = async () => [0.9, 0.1, 0]

    // when — searching for similar patterns
    await findSimilarPatterns(store, embedFn, defaultConfig, 'test', 'org-1')

    // then — updateUsageBatch was called with the matched entry ID
    expect(updatedIds).toContain('e1')
  })
})
