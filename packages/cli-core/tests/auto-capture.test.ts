import { describe, expect, test } from 'bun:test'
import { captureMemoryFromTurn, looksLikeFailure } from '../src/memory/auto-capture'
import type { MemoryConfig, MemoryDeps, MemoryStore, PatternEntry } from '../src/memory'

const config: MemoryConfig = {
  embeddingModel: 'x',
  embeddingBaseUrl: undefined,
  similarityThreshold: 0.78,
  maxResults: 3,
}

class FakeStore implements MemoryStore {
  entries: PatternEntry[] = []
  save(_o: string, e: PatternEntry): void {
    this.entries.push(e)
  }
  load(): PatternEntry[] {
    return this.entries
  }
  updateUsage(): void {}
  updateUsageBatch(): void {}
  delete(): void {}
  has(_o: string, incidentId: string): boolean {
    return this.entries.some((e) => e.incidentId === incidentId)
  }
}

function deps(store: MemoryStore): MemoryDeps {
  return { store, embed: async () => [], config }
}

describe('looksLikeFailure', () => {
  test('detects failure-shaped text', () => {
    expect(looksLikeFailure('Error: build failed with exit code 1')).toBe(true)
    expect(looksLikeFailure('Traceback (most recent call last):')).toBe(true)
    expect(looksLikeFailure('npm ERR! ENOENT no such file')).toBe(true)
  })

  test('ignores ordinary requests', () => {
    expect(looksLikeFailure('rename this function to fetchUser')).toBe(false)
    expect(looksLikeFailure('add a dark mode toggle')).toBe(false)
  })
})

describe('captureMemoryFromTurn', () => {
  test('saves a memory for a failure-shaped turn and returns its id', async () => {
    const store = new FakeStore()
    const receipt = await captureMemoryFromTurn(deps(store), {
      orgId: 'default',
      userMessage: 'deploy failed: Error connecting to database, exit code 1',
      resolution: 'The DATABASE_URL was unset; added it to the deploy env.',
    })
    expect(receipt.status).toBe('saved')
    if (receipt.status === 'saved') expect(receipt.entryId).toBeTruthy()
    expect(store.entries).toHaveLength(1)
  })

  test('skips ordinary (non-failure) turns', async () => {
    const store = new FakeStore()
    const receipt = await captureMemoryFromTurn(deps(store), {
      orgId: 'default',
      userMessage: 'rename fetchUser to getUser',
      resolution: 'done',
    })
    expect(receipt.status).toBe('skipped')
    if (receipt.status === 'skipped') expect(receipt.reason).toBe('not_failure')
    expect(store.entries).toHaveLength(0)
  })

  test('skips when there is no resolution to record', async () => {
    const store = new FakeStore()
    const receipt = await captureMemoryFromTurn(deps(store), {
      orgId: 'default',
      userMessage: 'CI failed with a timeout error',
      resolution: '   ',
    })
    expect(receipt.status).toBe('skipped')
    if (receipt.status === 'skipped') expect(receipt.reason).toBe('empty')
  })

  test('does not duplicate the same failure signature', async () => {
    const store = new FakeStore()
    const turn = {
      orgId: 'default',
      userMessage: 'deploy failed: Error at /home/a/app.ts:10 exit code 1',
      resolution: 'fixed the env var',
    }
    const first = await captureMemoryFromTurn(deps(store), turn)
    // same failure class, different path/line — should dedup by signature
    const second = await captureMemoryFromTurn(deps(store), {
      ...turn,
      userMessage: 'deploy failed: Error at /opt/b/app.ts:99 exit code 1',
    })
    expect(first.status).toBe('saved')
    expect(second.status).toBe('skipped')
    if (second.status === 'skipped') expect(second.reason).toBe('duplicate')
    expect(store.entries).toHaveLength(1)
  })
})
