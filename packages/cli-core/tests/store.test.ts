import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { PatternStore } from '../src/memory/store'
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

  test('updateUsage is no-op for missing entry', () => {
    store.save('org-1', makeEntry({ id: 'e1' }))
    store.updateUsage('org-1', 'nonexistent')
    expect(store.load('org-1')[0].usageCount).toBe(0)
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
})
