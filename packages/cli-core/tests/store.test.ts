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
    const entry = makeEntry()
    store.save('org-1', entry)
    const loaded = store.load('org-1')
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe('entry-1')
  })

  test('load returns empty array for unknown org', () => {
    expect(store.load('unknown-org')).toEqual([])
  })

  test('save appends multiple entries', () => {
    store.save('org-1', makeEntry({ id: 'a', incidentId: 'inc-a' }))
    store.save('org-1', makeEntry({ id: 'b', incidentId: 'inc-b' }))
    expect(store.load('org-1')).toHaveLength(2)
  })

  test('entries are org-scoped', () => {
    store.save('org-1', makeEntry({ id: 'a' }))
    store.save('org-2', makeEntry({ id: 'b' }))
    expect(store.load('org-1')).toHaveLength(1)
    expect(store.load('org-2')).toHaveLength(1)
    expect(store.load('org-1')[0].id).toBe('a')
    expect(store.load('org-2')[0].id).toBe('b')
  })

  test('has returns true for existing incident', () => {
    store.save('org-1', makeEntry({ incidentId: 'inc-42' }))
    expect(store.has('org-1', 'inc-42')).toBe(true)
  })

  test('has returns false for missing incident', () => {
    store.save('org-1', makeEntry({ incidentId: 'inc-42' }))
    expect(store.has('org-1', 'inc-99')).toBe(false)
  })

  test('updateUsage increments count and sets lastMatchedAt', () => {
    store.save('org-1', makeEntry({ id: 'e1' }))
    store.updateUsage('org-1', 'e1')
    const loaded = store.load('org-1')
    expect(loaded[0].usageCount).toBe(1)
    expect(loaded[0].lastMatchedAt).not.toBeNull()
  })

  test('updateUsageBatch increments all matched entries in one pass', () => {
    store.save('org-1', makeEntry({ id: 'e1' }))
    store.save('org-1', makeEntry({ id: 'e2', incidentId: 'inc-2' }))
    store.updateUsageBatch('org-1', ['e1', 'e2', 'e1'])
    const loaded = store.load('org-1')
    const e1 = loaded.find((entry) => entry.id === 'e1')
    const e2 = loaded.find((entry) => entry.id === 'e2')
    expect(e1?.usageCount).toBe(2)
    expect(e2?.usageCount).toBe(1)
    expect(e1?.lastMatchedAt).not.toBeNull()
    expect(e2?.lastMatchedAt).not.toBeNull()
  })

  test('updateUsage is no-op for missing entry', () => {
    store.save('org-1', makeEntry({ id: 'e1' }))
    store.updateUsage('org-1', 'nonexistent')
    expect(store.load('org-1')[0].usageCount).toBe(0)
  })

  test('setFeedback persists accepted/rejected feedback metadata', () => {
    store.save('org-1', makeEntry({ id: 'e1' }))
    store.setFeedback('org-1', 'e1', 'accepted', new Date('2026-06-26T00:00:00.000Z'))
    let loaded = store.load('org-1')
    expect(loaded[0].feedback).toBe('accepted')
    expect(loaded[0].feedbackAt).toBe('2026-06-26T00:00:00.000Z')

    store.setFeedback('org-1', 'e1', 'rejected', new Date('2026-06-26T01:00:00.000Z'))
    loaded = store.load('org-1')
    expect(loaded[0].feedback).toBe('rejected')
    expect(loaded[0].feedbackAt).toBe('2026-06-26T01:00:00.000Z')
  })

  test('delete removes an entry', () => {
    store.save('org-1', makeEntry({ id: 'a', incidentId: 'ia' }))
    store.save('org-1', makeEntry({ id: 'b', incidentId: 'ib' }))
    store.delete('org-1', 'a')
    const loaded = store.load('org-1')
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe('b')
  })

  test('delete is no-op for missing entry', () => {
    store.save('org-1', makeEntry({ id: 'a' }))
    store.delete('org-1', 'nonexistent')
    expect(store.load('org-1')).toHaveLength(1)
  })

  test('throws PatternStoreError when patterns file has invalid JSON', () => {
    const orgDir = join(TMP, 'org-1')
    mkdirSync(orgDir, { recursive: true })
    writeFileSync(join(orgDir, 'patterns.json'), '{not-json}', 'utf-8')
    expect(() => store.load('org-1')).toThrow(PatternStoreError)
  })
})
