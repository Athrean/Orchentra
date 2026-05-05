import { beforeEach, describe, expect, test } from 'bun:test'
import { dispatch, OperationError, type OperationContext } from '../src'
import { exportSkillsMdOperation } from '../src/ops/brain/export-skills-md'
import { setBrainAdapter, type BrainAdapter, type RunbookRow } from '../src/ops/brain/adapter'

const localCtx: OperationContext = { remote: false, allowedScopes: new Set(['read', 'write', 'admin']) }
const remoteReadCtx: OperationContext = { remote: true, allowedScopes: new Set(['read']) }

function rb(over: Partial<RunbookRow> = {}): RunbookRow {
  return {
    id: 'rb_1',
    orgId: 'org_1',
    name: 'rerun-flaky-deploy',
    description: 'Rerun a flaky deploy.',
    triggers: [],
    opsUsed: ['get_workflow_logs'],
    body: '# rerun-flaky-deploy\nrun this.\n',
    createdAt: new Date('2026-04-29T11:00:00Z'),
    ...over,
  }
}

function fakeAdapter(rows: RunbookRow[]): BrainAdapter {
  return {
    saveEpisode: async (e) => e,
    listEpisodes: async () => [],
    getRunbook: async (id) => rows.find((r) => r.id === id) ?? null,
    listRunbooks: async (filter) =>
      rows.filter((r) => {
        if (filter.orgId && r.orgId !== filter.orgId) return false
        return true
      }),
  }
}

describe('export_skills_md operation', () => {
  beforeEach(() => {
    setBrainAdapter(
      fakeAdapter([
        rb({ id: 'rb_1', orgId: 'org_1', name: 'rerun-flaky-deploy' }),
        rb({ id: 'rb_2', orgId: 'org_1', name: 'rotate-secrets', body: '# rotate-secrets\n' }),
        rb({ id: 'rb_3', orgId: 'org_2', name: 'rerun-flaky-deploy' }),
      ]),
    )
  })

  test('exports a single runbook by id', async () => {
    const out = (await dispatch(exportSkillsMdOperation, localCtx, { runbookId: 'rb_1' })) as {
      skills: Array<{ name: string; markdown: string }>
    }
    expect(out.skills).toHaveLength(1)
    expect(out.skills[0].name).toBe('rerun-flaky-deploy')
    expect(out.skills[0].markdown).toContain('---\nname: rerun-flaky-deploy')
    expect(out.skills[0].markdown).toContain('# rerun-flaky-deploy')
  })

  test('exports all runbooks for an org when no runbookId is supplied', async () => {
    const out = (await dispatch(exportSkillsMdOperation, localCtx, { orgId: 'org_1' })) as {
      skills: Array<{ name: string; markdown: string }>
    }
    expect(out.skills.map((s) => s.name).sort()).toEqual(['rerun-flaky-deploy', 'rotate-secrets'])
  })

  test('not_found when runbookId does not exist', async () => {
    let raised: OperationError | null = null
    try {
      await dispatch(exportSkillsMdOperation, localCtx, { runbookId: 'rb_missing' })
    } catch (err) {
      raised = err as OperationError
    }
    expect(raised?.code).toBe('not_found')
  })

  test('remote read is allowed', async () => {
    const out = (await dispatch(exportSkillsMdOperation, remoteReadCtx, { runbookId: 'rb_1' })) as {
      skills: Array<{ markdown: string }>
    }
    expect(out.skills[0].markdown).toContain('---')
  })

  test('rejects when neither runbookId nor orgId is supplied', async () => {
    let raised: OperationError | null = null
    try {
      await dispatch(exportSkillsMdOperation, localCtx, {})
    } catch (err) {
      raised = err as OperationError
    }
    expect(raised?.code).toBe('invalid_input')
  })

  test('operation metadata: read-scoped', () => {
    expect(exportSkillsMdOperation.id).toBe('export_skills_md')
    expect(exportSkillsMdOperation.scope).toBe('read')
    expect(exportSkillsMdOperation.mutating).toBe(false)
  })
})
