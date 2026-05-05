import { beforeEach, describe, expect, test } from 'bun:test'
import { dispatch, OperationError, type OperationContext } from '../src'
import { recordEpisodeOperation } from '../src/ops/brain/record-episode'
import { setBrainAdapter, type BrainAdapter, type EpisodeRow } from '../src/ops/brain/adapter'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

const remoteCtx: OperationContext = {
  remote: true,
  allowedScopes: new Set(['read', 'write']),
}

interface FakeStore {
  saved: EpisodeRow[]
}

function fakeAdapter(store: FakeStore): BrainAdapter {
  return {
    saveEpisode: async (ep) => {
      store.saved.push(ep)
      return ep
    },
    listEpisodes: async () => store.saved,
    getRunbook: async () => null,
    listRunbooks: async () => [],
  }
}

describe('record_episode operation', () => {
  let store: FakeStore

  beforeEach(() => {
    store = { saved: [] }
    setBrainAdapter(fakeAdapter(store))
  })

  test('local caller with write scope persists an episode and returns it', async () => {
    const result = (await dispatch(recordEpisodeOperation, localCtx, {
      orgId: 'org_1',
      executionId: 'exec_42',
      kind: 'ci_failure',
      summary: 'Re-ran flaky deploy',
      opsCalled: ['get_workflow_logs', 'post_comment'],
      outcome: 'success',
    })) as { id: string; executionId: string; outcome: string }

    expect(result.id).toBeDefined()
    expect(result.executionId).toBe('exec_42')
    expect(result.outcome).toBe('success')
    expect(store.saved).toHaveLength(1)
    expect(store.saved[0].opsCalled).toEqual(['get_workflow_logs', 'post_comment'])
  })

  test('remote caller is rejected — write ops fail closed without local approval', async () => {
    let raised: OperationError | null = null
    try {
      await dispatch(recordEpisodeOperation, remoteCtx, {
        orgId: 'org_1',
        executionId: 'exec_42',
        kind: 'ci_failure',
        summary: 'remote try',
        opsCalled: [],
        outcome: 'unknown',
      })
    } catch (err) {
      raised = err as OperationError
    }
    expect(raised).toBeInstanceOf(OperationError)
    expect(raised?.code).toBe('permission_denied')
    expect(store.saved).toHaveLength(0)
  })

  test('rejects malformed input via dispatch', async () => {
    let raised: OperationError | null = null
    try {
      await dispatch(recordEpisodeOperation, localCtx, { orgId: 'org_1' })
    } catch (err) {
      raised = err as OperationError
    }
    expect(raised?.code).toBe('invalid_input')
  })

  test('outcome defaults to "unknown" when omitted', async () => {
    const result = (await dispatch(recordEpisodeOperation, localCtx, {
      orgId: 'org_1',
      executionId: 'exec_43',
      kind: 'cron',
      summary: 'scheduled tick',
      opsCalled: [],
    })) as { outcome: string }
    expect(result.outcome).toBe('unknown')
  })

  test('operation metadata: write-scoped, mutating, non-localOnly', () => {
    expect(recordEpisodeOperation.id).toBe('record_episode')
    expect(recordEpisodeOperation.scope).toBe('write')
    expect(recordEpisodeOperation.mutating).toBe(true)
    expect(recordEpisodeOperation.localOnly).toBe(false)
  })
})
