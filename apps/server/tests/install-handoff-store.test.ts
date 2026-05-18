import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import {
  createMemoryInstallHandoffStore,
  HandoffDuplicateStateError,
  HandoffExpiredError,
  HandoffNotFoundError,
  type InstallHandoffStore,
} from '../src/github/install-handoff-memory-store'

let store: InstallHandoffStore
let clock = 0

beforeEach(() => {
  clock = 1_700_000_000_000
  store = createMemoryInstallHandoffStore({ now: () => clock, ttlMs: 5 * 60_000 })
})

afterAll(() => {
  // no global to reset; store is local per test
})

describe('createMemoryInstallHandoffStore', () => {
  test('start + get round-trip returns the pending entry', () => {
    store.start({ state: 'abc123', redirectUri: 'http://127.0.0.1:49281/install-cb' })
    const entry = store.get('abc123')
    expect(entry).toBeDefined()
    expect(entry?.state).toBe('abc123')
    expect(entry?.redirectUri).toBe('http://127.0.0.1:49281/install-cb')
    expect(entry?.status).toBe('pending')
    expect(entry?.createdAt).toBe(clock)
    expect(entry?.expiresAt).toBe(clock + 5 * 60_000)
  })

  test('start with a duplicate state throws HandoffDuplicateStateError', () => {
    store.start({ state: 'abc123', redirectUri: 'http://127.0.0.1:49281/install-cb' })
    expect(() => store.start({ state: 'abc123', redirectUri: 'http://127.0.0.1:50000/install-cb' })).toThrow(
      HandoffDuplicateStateError,
    )
  })

  test('complete marks the entry status and attaches the result', () => {
    store.start({ state: 's1', redirectUri: 'http://127.0.0.1:49281/install-cb' })
    store.complete('s1', { orgId: 'Athrean', installationId: 12345, apiKey: 'plaintext-key' })
    const entry = store.get('s1')
    expect(entry?.status).toBe('complete')
    expect(entry?.result).toEqual({ orgId: 'Athrean', installationId: 12345, apiKey: 'plaintext-key' })
  })

  test('complete on unknown state throws HandoffNotFoundError', () => {
    expect(() => store.complete('missing', { orgId: 'o', installationId: 1, apiKey: 'k' })).toThrow(
      HandoffNotFoundError,
    )
  })

  test('complete is single-use — a second call on the same state throws HandoffNotFoundError', () => {
    store.start({ state: 's1', redirectUri: 'http://127.0.0.1:49281/install-cb' })
    store.complete('s1', { orgId: 'Athrean', installationId: 12345, apiKey: 'k1' })
    expect(() => store.complete('s1', { orgId: 'Athrean', installationId: 12345, apiKey: 'k2' })).toThrow(
      HandoffNotFoundError,
    )
  })

  test('get returns the expired entry once TTL has elapsed', () => {
    store.start({ state: 's1', redirectUri: 'http://127.0.0.1:49281/install-cb' })
    clock += 5 * 60_000 + 1
    const entry = store.get('s1')
    expect(entry?.status).toBe('expired')
  })

  test('complete on an expired pending state throws HandoffExpiredError', () => {
    store.start({ state: 's1', redirectUri: 'http://127.0.0.1:49281/install-cb' })
    clock += 5 * 60_000 + 1
    expect(() => store.complete('s1', { orgId: 'Athrean', installationId: 12345, apiKey: 'k' })).toThrow(
      HandoffExpiredError,
    )
  })

  test('sweep removes expired entries and returns the count', () => {
    store.start({ state: 's1', redirectUri: 'http://127.0.0.1:49281/install-cb' })
    store.start({ state: 's2', redirectUri: 'http://127.0.0.1:49281/install-cb' })
    clock += 5 * 60_000 + 1
    store.start({ state: 's3', redirectUri: 'http://127.0.0.1:49281/install-cb' })
    const removed = store.sweep()
    expect(removed).toBe(2)
    expect(store.get('s1')).toBeUndefined()
    expect(store.get('s2')).toBeUndefined()
    expect(store.get('s3')?.status).toBe('pending')
  })
})
