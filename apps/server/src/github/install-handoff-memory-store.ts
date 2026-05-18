/**
 * In-memory store for CLI bootstrap handoff entries. Each entry pins a
 * one-time `state` nonce to a loopback redirect URI for the duration of
 * a GitHub App install / configure round-trip. Entries expire after
 * `ttlMs` and a callback consuming a state moves it from 'pending' to
 * 'complete' exactly once.
 *
 * Lives alongside `installations-memory-store.ts` and follows the same
 * factory + DI seam pattern. No global state; tests instantiate fresh.
 */

export interface HandoffResult {
  readonly orgId: string
  readonly installationId: number
  readonly apiKey: string
}

export interface HandoffEntry {
  readonly state: string
  readonly redirectUri: string
  readonly createdAt: number
  readonly expiresAt: number
  readonly status: 'pending' | 'complete' | 'expired'
  readonly result?: HandoffResult
}

export interface InstallHandoffStore {
  start(input: { state: string; redirectUri: string }): void
  complete(state: string, result: HandoffResult): void
  get(state: string): HandoffEntry | undefined
  sweep(): number
}

export interface MemoryStoreOptions {
  readonly now: () => number
  readonly ttlMs: number
}

export class HandoffDuplicateStateError extends Error {
  constructor(state: string) {
    super(`handoff state already in use: ${state}`)
    this.name = 'HandoffDuplicateStateError'
  }
}

export class HandoffNotFoundError extends Error {
  constructor(state: string) {
    super(`handoff state not found: ${state}`)
    this.name = 'HandoffNotFoundError'
  }
}

export class HandoffExpiredError extends Error {
  constructor(state: string) {
    super(`handoff state expired: ${state}`)
    this.name = 'HandoffExpiredError'
  }
}

export function createMemoryInstallHandoffStore(opts: MemoryStoreOptions): InstallHandoffStore {
  const entries = new Map<string, HandoffEntry>()

  return {
    start({ state, redirectUri }) {
      if (entries.has(state)) throw new HandoffDuplicateStateError(state)
      const now = opts.now()
      const entry: HandoffEntry = {
        state,
        redirectUri,
        createdAt: now,
        expiresAt: now + opts.ttlMs,
        status: 'pending',
      }
      entries.set(state, entry)
    },
    complete(state, result) {
      const entry = entries.get(state)
      if (!entry || entry.status !== 'pending') throw new HandoffNotFoundError(state)
      if (opts.now() >= entry.expiresAt) throw new HandoffExpiredError(state)
      entries.set(state, { ...entry, status: 'complete', result })
    },
    get(state) {
      const entry = entries.get(state)
      if (!entry) return undefined
      if (entry.status === 'pending' && opts.now() >= entry.expiresAt) {
        return { ...entry, status: 'expired' }
      }
      return entry
    },
    sweep() {
      const now = opts.now()
      let removed = 0
      for (const [state, entry] of entries) {
        if (now >= entry.expiresAt) {
          entries.delete(state)
          removed++
        }
      }
      return removed
    },
  }
}
