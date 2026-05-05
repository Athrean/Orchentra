import { beforeEach, describe, expect, test } from 'bun:test'
import { dispatch, OperationError, type OperationContext } from '../src'
import { getRunbookOperation } from '../src/ops/brain/get-runbook'
import { listRunbooksOperation } from '../src/ops/brain/list-runbooks'
import { setBrainAdapter, type BrainAdapter, type RunbookRow } from '../src/ops/brain/adapter'

const localCtx: OperationContext = { remote: false, allowedScopes: new Set(['read', 'write', 'admin']) }
const remoteReadCtx: OperationContext = { remote: true, allowedScopes: new Set(['read']) }

function rb(over: Partial<RunbookRow> = {}): RunbookRow {
  return {
    id: 'rb_1',
    orgId: 'org_1',
    name: 'rerun-flaky-deploy',
    description: 'Rerun a flaky deploy.',
    triggers: ['execution.kind:ci_failure'],
    opsUsed: ['get_workflow_logs'],
    body: '# rerun-flaky-deploy\n',
    createdAt: new Date('2026-04-29T11:00:00Z'),
    ...over,
  }
}

function fakeAdapter(rows: RunbookRow[]): BrainAdapter {
  return {
    saveEpisode: async (e) => e,
    listEpisodes: async () => [],
    getRunbook: async (id) => rows.find((r) => r.id === id) ?? null,
    listRunbooks: async (filter) => {
      return rows.filter((r) => {
        if (filter.orgId && r.orgId !== filter.orgId) return false
        if (filter.name && r.name !== filter.name) return false
        return true
      })
    },
  }
}

describe('get_runbook operation', () => {
  beforeEach(() => {
    setBrainAdapter(fakeAdapter([rb({ id: 'rb_1' }), rb({ id: 'rb_2', name: 'rotate-secrets' })]))
  })

  test('returns the runbook with the matching id', async () => {
    const out = (await dispatch(getRunbookOperation, localCtx, { id: 'rb_2' })) as { runbook: RunbookRow }
    expect(out.runbook.id).toBe('rb_2')
    expect(out.runbook.name).toBe('rotate-secrets')
  })

  test('returns not_found when id does not match', async () => {
    let raised: OperationError | null = null
    try {
      await dispatch(getRunbookOperation, localCtx, { id: 'rb_missing' })
    } catch (err) {
      raised = err as OperationError
    }
    expect(raised?.code).toBe('not_found')
  })

  test('remote read is allowed', async () => {
    const out = (await dispatch(getRunbookOperation, remoteReadCtx, { id: 'rb_1' })) as { runbook: RunbookRow }
    expect(out.runbook.id).toBe('rb_1')
  })

  test('rejects malformed input', async () => {
    let raised: OperationError | null = null
    try {
      await dispatch(getRunbookOperation, localCtx, {})
    } catch (err) {
      raised = err as OperationError
    }
    expect(raised?.code).toBe('invalid_input')
  })

  test('operation metadata: read-scoped, non-mutating', () => {
    expect(getRunbookOperation.id).toBe('get_runbook')
    expect(getRunbookOperation.scope).toBe('read')
    expect(getRunbookOperation.mutating).toBe(false)
  })
})

describe('list_runbooks operation', () => {
  beforeEach(() => {
    setBrainAdapter(
      fakeAdapter([
        rb({ id: 'rb_1', orgId: 'org_1', name: 'rerun-flaky-deploy' }),
        rb({ id: 'rb_2', orgId: 'org_1', name: 'rotate-secrets' }),
        rb({ id: 'rb_3', orgId: 'org_2', name: 'rerun-flaky-deploy' }),
      ]),
    )
  })

  test('returns all runbooks when no filter is supplied', async () => {
    const out = (await dispatch(listRunbooksOperation, localCtx, {})) as { runbooks: RunbookRow[] }
    expect(out.runbooks).toHaveLength(3)
  })

  test('filter by orgId narrows results', async () => {
    const out = (await dispatch(listRunbooksOperation, localCtx, { orgId: 'org_2' })) as { runbooks: RunbookRow[] }
    expect(out.runbooks.map((r) => r.id)).toEqual(['rb_3'])
  })

  test('filter by name narrows results', async () => {
    const out = (await dispatch(listRunbooksOperation, localCtx, { name: 'rerun-flaky-deploy' })) as {
      runbooks: RunbookRow[]
    }
    expect(out.runbooks.map((r) => r.id).sort()).toEqual(['rb_1', 'rb_3'])
  })

  test('operation metadata: read-scoped', () => {
    expect(listRunbooksOperation.id).toBe('list_runbooks')
    expect(listRunbooksOperation.scope).toBe('read')
  })
})
