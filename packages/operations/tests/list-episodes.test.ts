import { beforeEach, describe, expect, test } from 'bun:test'
import { dispatch, OperationError, type OperationContext } from '../src'
import { listEpisodesOperation } from '../src/ops/brain/list-episodes'
import { setBrainAdapter, type BrainAdapter, type EpisodeRow, type ListEpisodesFilter } from '../src/ops/brain/adapter'

const localCtx: OperationContext = { remote: false, allowedScopes: new Set(['read', 'write', 'admin']) }
const remoteReadCtx: OperationContext = { remote: true, allowedScopes: new Set(['read']) }

function row(over: Partial<EpisodeRow> = {}): EpisodeRow {
  return {
    id: 'ep_a',
    orgId: 'org_1',
    executionId: 'exec_1',
    kind: 'ci_failure',
    summary: 'sample',
    opsCalled: [],
    outcome: 'success',
    createdAt: new Date('2026-04-29T10:00:00Z'),
    ...over,
  }
}

function fakeAdapter(rows: EpisodeRow[]): { adapter: BrainAdapter; lastFilter: ListEpisodesFilter | null } {
  let lastFilter: ListEpisodesFilter | null = null
  const adapter: BrainAdapter = {
    saveEpisode: async (e) => e,
    listEpisodes: async (f) => {
      lastFilter = f
      return rows.filter((r) => {
        if (f.orgId && r.orgId !== f.orgId) return false
        if (f.kind && r.kind !== f.kind) return false
        if (f.since && r.createdAt < new Date(f.since)) return false
        return true
      })
    },
    getRunbook: async () => null,
    listRunbooks: async () => [],
  }
  return {
    adapter,
    get lastFilter() {
      return lastFilter
    },
  }
}

describe('list_episodes operation', () => {
  let store: { adapter: BrainAdapter; lastFilter: ListEpisodesFilter | null }

  beforeEach(() => {
    store = fakeAdapter([
      row({ id: 'ep_1', kind: 'ci_failure', orgId: 'org_1' }),
      row({ id: 'ep_2', kind: 'cron', orgId: 'org_1' }),
      row({ id: 'ep_3', kind: 'ci_failure', orgId: 'org_2' }),
    ])
    setBrainAdapter(store.adapter)
  })

  test('local read returns all episodes when no filter is supplied', async () => {
    const out = (await dispatch(listEpisodesOperation, localCtx, {})) as { episodes: EpisodeRow[] }
    expect(out.episodes).toHaveLength(3)
  })

  test('filter by orgId narrows results', async () => {
    const out = (await dispatch(listEpisodesOperation, localCtx, { orgId: 'org_1' })) as { episodes: EpisodeRow[] }
    expect(out.episodes.map((e) => e.id).sort()).toEqual(['ep_1', 'ep_2'])
  })

  test('filter by kind narrows results', async () => {
    const out = (await dispatch(listEpisodesOperation, localCtx, { kind: 'cron' })) as { episodes: EpisodeRow[] }
    expect(out.episodes.map((e) => e.id)).toEqual(['ep_2'])
  })

  test('remote read is allowed (read-scoped)', async () => {
    const out = (await dispatch(listEpisodesOperation, remoteReadCtx, {})) as { episodes: EpisodeRow[] }
    expect(out.episodes).toHaveLength(3)
  })

  test('rejects invalid limit', async () => {
    let raised: OperationError | null = null
    try {
      await dispatch(listEpisodesOperation, localCtx, { limit: -1 })
    } catch (err) {
      raised = err as OperationError
    }
    expect(raised?.code).toBe('invalid_input')
  })

  test('operation metadata: read-scoped, non-mutating, non-localOnly', () => {
    expect(listEpisodesOperation.id).toBe('list_episodes')
    expect(listEpisodesOperation.scope).toBe('read')
    expect(listEpisodesOperation.mutating).toBe(false)
    expect(listEpisodesOperation.localOnly).toBe(false)
  })
})
