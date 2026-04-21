import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { PatternStore, PatternStoreError } from '../src/memory/store'
import type { PatternEntry } from '../src/memory/types'

const TMP = join(import.meta.dir, '__memory_test_tmp__')
const store = new PatternStore(TMP)

function makeEntry(overrides: Partial<PatternEntry> = {}): PatternEntry {
  return {
    id: 'entry-1',
    orgId: 'org-1',
    incidentId: 'inc-1',
    embedding: [0.1, 0.2, 0.3],
    pattern: 'workflow: ci\nbranch: main\nroot_cause: timeout',
    resolution: 'increase timeout',
    failureType: 'infra_timeout',
    usageCount: 0,
    lastMatchedAt: null,
    createdAt: '2026-04-21T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  mkdirSync(TMP, { recursive: true })
})

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe('PatternStore', () => {
  test('save and load round-trips an entry', () => {
    // given — a pattern entry
    const entry = makeEntry()

    // when — the entry is saved and then loaded
    store.save('org-1', entry)
    const loaded = store.load('org-1')

    // then — the loaded entry matches the original
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe('entry-1')
  })

  test('load returns empty array for unknown org', () => {
    // given — a store with no entries for an org
    // when — loading that org
    // then — returns empty array
    expect(store.load('unknown-org')).toEqual([])
  })

  test('save appends multiple entries', () => {
    // given — two entries for the same org
    // when — both are saved
    store.save('org-1', makeEntry({ id: 'a', incidentId: 'inc-a' }))
    store.save('org-1', makeEntry({ id: 'b', incidentId: 'inc-b' }))

    // then — load returns both
    expect(store.load('org-1')).toHaveLength(2)
  })

  test('entries are org-scoped', () => {
    // given — entries for two different orgs
    // when — saving each to its own org
    store.save('org-1', makeEntry({ id: 'a' }))
    store.save('org-2', makeEntry({ id: 'b' }))

    // then — each org only sees its own entries
    expect(store.load('org-1')).toHaveLength(1)
    expect(store.load('org-2')).toHaveLength(1)
    expect(store.load('org-1')[0].id).toBe('a')
    expect(store.load('org-2')[0].id).toBe('b')
  })

  test('has returns true for existing incident', () => {
    // given — a saved entry with a known incident ID
    store.save('org-1', makeEntry({ incidentId: 'inc-42' }))

    // when — checking for that incident
    // then — returns true
    expect(store.has('org-1', 'inc-42')).toBe(true)
  })

  test('has returns false for missing incident', () => {
    // given — a saved entry with one incident ID
    store.save('org-1', makeEntry({ incidentId: 'inc-42' }))

    // when — checking for a different incident
    // then — returns false
    expect(store.has('org-1', 'inc-99')).toBe(false)
  })

  test('updateUsage increments count and sets lastMatchedAt', () => {
    // given — a saved entry
    store.save('org-1', makeEntry({ id: 'e1' }))

    // when — updateUsage is called
    store.updateUsage('org-1', 'e1')

    // then — usageCount is incremented and lastMatchedAt is set
    const loaded = store.load('org-1')
    expect(loaded[0].usageCount).toBe(1)
    expect(loaded[0].lastMatchedAt).not.toBeNull()
  })

  test('updateUsageBatch increments all matched entries in one pass', () => {
    // given — two saved entries
    store.save('org-1', makeEntry({ id: 'e1' }))
    store.save('org-1', makeEntry({ id: 'e2', incidentId: 'inc-2' }))

    // when — updateUsageBatch is called with both IDs (e1 twice)
    store.updateUsageBatch('org-1', ['e1', 'e2', 'e1'])

    // then — counts reflect the batch, with e1 incremented twice
    const loaded = store.load('org-1')
    const e1 = loaded.find((entry) => entry.id === 'e1')
    const e2 = loaded.find((entry) => entry.id === 'e2')
    expect(e1?.usageCount).toBe(2)
    expect(e2?.usageCount).toBe(1)
    expect(e1?.lastMatchedAt).not.toBeNull()
    expect(e2?.lastMatchedAt).not.toBeNull()
  })

  test('updateUsage is no-op for missing entry', () => {
    // given — a saved entry
    store.save('org-1', makeEntry({ id: 'e1' }))

    // when — updateUsage is called with a nonexistent ID
    store.updateUsage('org-1', 'nonexistent')

    // then — existing entry is unchanged
    expect(store.load('org-1')[0].usageCount).toBe(0)
  })

  test('delete removes an entry', () => {
    // given — two saved entries
    store.save('org-1', makeEntry({ id: 'a', incidentId: 'ia' }))
    store.save('org-1', makeEntry({ id: 'b', incidentId: 'ib' }))

    // when — one entry is deleted
    store.delete('org-1', 'a')

    // then — only the other entry remains
    const loaded = store.load('org-1')
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe('b')
  })

  test('delete is no-op for missing entry', () => {
    // given — a saved entry
    store.save('org-1', makeEntry({ id: 'a' }))

    // when — deleting a nonexistent ID
    store.delete('org-1', 'nonexistent')

    // then — the entry is still there
    expect(store.load('org-1')).toHaveLength(1)
  })

  test('throws PatternStoreError when patterns file has invalid JSON', () => {
    // given — a patterns file with invalid JSON
    const orgDir = join(TMP, 'org-1')
    mkdirSync(orgDir, { recursive: true })
    writeFileSync(join(orgDir, 'patterns.json'), '{not-json}', 'utf-8')

    // when — loading from that org
    // then — throws PatternStoreError
    expect(() => store.load('org-1')).toThrow(PatternStoreError)
  })
})
