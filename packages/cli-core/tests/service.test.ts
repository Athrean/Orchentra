import { test, expect, describe } from 'bun:test'
import { prepareMemoryContext, recordResolvedPattern, type MemoryDeps } from '../src/memory/service'
import type { EmbedFn, MemoryConfig, MemoryStore, PatternEntry } from '../src/memory/types'

const config: MemoryConfig = {
  embeddingModel: 'test-model',
  embeddingBaseUrl: 'http://localhost',
  similarityThreshold: 0.5,
  maxResults: 3,
}

function makeStore(initial: PatternEntry[] = []): MemoryStore & { saved: PatternEntry[] } {
  const entries = [...initial]
  const saved: PatternEntry[] = []
  return {
    saved,
    save(_orgId, entry) {
      entries.push(entry)
      saved.push(entry)
    },
    load() {
      return entries
    },
    updateUsage() {},
    delete() {},
    has(orgId, incidentId) {
      return entries.some((e) => e.orgId === orgId && e.incidentId === incidentId)
    },
  }
}

const constantEmbed: EmbedFn = async () => [1, 0, 0]

describe('prepareMemoryContext', () => {
  test('returns empty context when store has no patterns', async () => {
    const store = makeStore()
    const deps: MemoryDeps = { store, embed: constantEmbed, config }
    const result = await prepareMemoryContext(deps, 'org-1', 'failure text')
    expect(result.text).toBe('')
    expect(result.matches).toHaveLength(0)
  })

  test('returns formatted context when matches exist', async () => {
    const store = makeStore([
      {
        id: 'e1',
        orgId: 'org-1',
        incidentId: 'inc-1',
        embedding: [1, 0, 0],
        pattern: 'workflow: ci\nroot_cause: timeout',
        resolution: 'increase timeout',
        failureType: 'infra_timeout',
        usageCount: 0,
        lastMatchedAt: null,
        createdAt: '2026-04-21T00:00:00Z',
      },
    ])
    const deps: MemoryDeps = { store, embed: constantEmbed, config }
    const result = await prepareMemoryContext(deps, 'org-1', 'failure text')
    expect(result.matches).toHaveLength(1)
    expect(result.text).toContain('## Similar Past Incidents')
    expect(result.text).toContain('increase timeout')
  })

  test('respects org boundary', async () => {
    const store = makeStore([
      {
        id: 'e1',
        orgId: 'org-1',
        incidentId: 'inc-1',
        embedding: [1, 0, 0],
        pattern: 'p',
        resolution: 'r',
        failureType: 'unknown',
        usageCount: 0,
        lastMatchedAt: null,
        createdAt: '',
      },
    ])
    const deps: MemoryDeps = {
      store: { ...store, load: (orgId) => (orgId === 'org-1' ? store.load('org-1') : []) },
      embed: constantEmbed,
      config,
    }
    const otherOrg = await prepareMemoryContext(deps, 'org-2', 'q')
    expect(otherOrg.matches).toHaveLength(0)
  })
})

describe('recordResolvedPattern', () => {
  test('saves a new pattern entry', async () => {
    const store = makeStore()
    const deps: MemoryDeps = { store, embed: constantEmbed, config }
    const result = await recordResolvedPattern(
      deps,
      {
        orgId: 'org-1',
        incidentId: 'inc-1',
        workflowName: 'ci',
        branch: 'main',
        rootCause: 'timeout',
        suggestedFix: 'increase timeout',
        failureType: 'infra_timeout',
      },
      () => new Date('2026-04-21T00:00:00Z'),
    )
    expect(result.saved).toBe(true)
    expect(store.saved).toHaveLength(1)
    expect(store.saved[0].pattern).toContain('workflow: ci')
    expect(store.saved[0].resolution).toBe('increase timeout')
    expect(store.saved[0].failureType).toBe('infra_timeout')
    expect(store.saved[0].embedding).toEqual([1, 0, 0])
    expect(store.saved[0].createdAt).toBe('2026-04-21T00:00:00.000Z')
  })

  test('is idempotent — does not save when incident already recorded', async () => {
    const store = makeStore([
      {
        id: 'existing',
        orgId: 'org-1',
        incidentId: 'inc-1',
        embedding: [],
        pattern: '',
        resolution: '',
        failureType: 'unknown',
        usageCount: 0,
        lastMatchedAt: null,
        createdAt: '',
      },
    ])
    const deps: MemoryDeps = { store, embed: constantEmbed, config }
    const result = await recordResolvedPattern(deps, {
      orgId: 'org-1',
      incidentId: 'inc-1',
      workflowName: 'ci',
      branch: 'main',
      rootCause: 'timeout',
    })
    expect(result.saved).toBe(false)
    expect(result.entry).toBeNull()
    expect(store.saved).toHaveLength(0)
  })

  test('falls back to "unknown" failure type and "No resolution recorded"', async () => {
    const store = makeStore()
    const deps: MemoryDeps = { store, embed: constantEmbed, config }
    const result = await recordResolvedPattern(deps, {
      orgId: 'org-1',
      incidentId: 'inc-2',
      workflowName: 'ci',
      branch: 'main',
      rootCause: 'tbd',
    })
    expect(result.saved).toBe(true)
    expect(result.entry?.failureType).toBe('unknown')
    expect(result.entry?.resolution).toBe('No resolution recorded')
  })

  test('does not embed when entry already exists', async () => {
    let embedCalls = 0
    const embed: EmbedFn = async () => {
      embedCalls += 1
      return [1, 0, 0]
    }
    const store = makeStore([
      {
        id: 'existing',
        orgId: 'org-1',
        incidentId: 'inc-1',
        embedding: [],
        pattern: '',
        resolution: '',
        failureType: 'unknown',
        usageCount: 0,
        lastMatchedAt: null,
        createdAt: '',
      },
    ])
    const deps: MemoryDeps = { store, embed, config }
    await recordResolvedPattern(deps, {
      orgId: 'org-1',
      incidentId: 'inc-1',
      workflowName: 'ci',
      branch: 'main',
      rootCause: 'timeout',
    })
    expect(embedCalls).toBe(0)
  })
})
