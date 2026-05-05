import { afterEach, describe, expect, test } from 'bun:test'
import {
  dispatch,
  recordEpisodeOperation,
  listEpisodesOperation,
  setBrainAdapter,
  type BrainAdapter,
  type EpisodeRow,
  type OperationContext,
} from '@orchentra/operations'

const localCtx: OperationContext = { remote: false, allowedScopes: new Set(['read', 'write', 'admin']) }

/**
 * In-memory BrainAdapter — exercises the same record / list dispatch path the
 * real Drizzle adapter would, without touching Postgres. The drizzle adapter
 * itself is unit-tested via its own structural shape; this test guards the
 * end-to-end glue between dispatch and a wired BrainAdapter.
 */
function inMemoryBrainAdapter(): { adapter: BrainAdapter; rows: EpisodeRow[] } {
  const rows: EpisodeRow[] = []
  const adapter: BrainAdapter = {
    saveEpisode: async (row) => {
      rows.push(row)
      return row
    },
    listEpisodes: async (filter) =>
      rows.filter((r) => {
        if (filter.orgId && r.orgId !== filter.orgId) return false
        if (filter.kind && r.kind !== filter.kind) return false
        return true
      }),
    getRunbook: async () => null,
    listRunbooks: async () => [],
  }
  return { adapter, rows }
}

afterEach(() => {
  setBrainAdapter(null)
})

describe('brain ops wiring (server-side)', () => {
  test('record_episode followed by list_episodes returns the saved row end-to-end', async () => {
    const { adapter, rows } = inMemoryBrainAdapter()
    setBrainAdapter(adapter)

    const recorded = (await dispatch(recordEpisodeOperation, localCtx, {
      orgId: 'org_test',
      executionId: 'exec_test',
      kind: 'ci_failure',
      summary: 'wired through dispatch',
      opsCalled: ['get_workflow_logs'],
      outcome: 'success',
    })) as EpisodeRow

    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(recorded.id)

    const listed = (await dispatch(listEpisodesOperation, localCtx, { orgId: 'org_test' })) as {
      episodes: EpisodeRow[]
    }
    expect(listed.episodes).toHaveLength(1)
    expect(listed.episodes[0].summary).toBe('wired through dispatch')
    expect(listed.episodes[0].opsCalled).toEqual(['get_workflow_logs'])
  })

  test('listing with kind filter narrows results returned through dispatch', async () => {
    const { adapter } = inMemoryBrainAdapter()
    setBrainAdapter(adapter)

    await dispatch(recordEpisodeOperation, localCtx, {
      orgId: 'org_a',
      executionId: 'exec_1',
      kind: 'ci_failure',
      summary: 'one',
      opsCalled: [],
      outcome: 'success',
    })
    await dispatch(recordEpisodeOperation, localCtx, {
      orgId: 'org_a',
      executionId: 'exec_2',
      kind: 'cron',
      summary: 'two',
      opsCalled: [],
      outcome: 'success',
    })

    const cron = (await dispatch(listEpisodesOperation, localCtx, { kind: 'cron' })) as {
      episodes: EpisodeRow[]
    }
    expect(cron.episodes.map((e) => e.summary)).toEqual(['two'])
  })
})
