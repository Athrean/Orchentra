import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { drizzleMockBase } from './helpers/drizzle-mock'
import { dbClientMockBase } from './helpers/db-client-mock'

// ── DB mock ──────────────────────────────────────────────────────────────────

const mockExecute = mock(async () => [])
const mockSelect = mock(() => ({
  from: mock(() => ({
    where: mock(() => ({
      groupBy: mock(() => ({
        orderBy: mock(() => ({
          limit: mock(async () => []),
        })),
      })),
    })),
  })),
}))

mock.module('../src/db/client', () => ({
  ...dbClientMockBase(),
  db: {
    execute: mockExecute,
    select: mockSelect,
  },
  incidents: {
    orgId: 'org_id',
    repo: 'repo',
    workflowName: 'workflow_name',
    failedStep: 'failed_step',
    triggeredAt: 'triggered_at',
  },
}))

mock.module('drizzle-orm', () => ({
  ...drizzleMockBase(),
  sql: new Proxy(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      _tag: 'SQL',
      strings,
      values,
    }),
    {
      get: (target, prop) => {
        if (prop === 'append') return () => {}
        return target
      },
    },
  ),
  and: (...args: unknown[]) => ({ _tag: 'AND', args }),
  eq: (col: unknown, val: unknown) => ({ _tag: 'EQ', col, val }),
  gte: (col: unknown, val: unknown) => ({ _tag: 'GTE', col, val }),
  lte: (col: unknown, val: unknown) => ({ _tag: 'LTE', col, val }),
  desc: (expr: unknown) => ({ _tag: 'DESC', expr }),
}))

import { getAnalytics } from '../src/queries/analytics'

// ── Helpers ──────────────────────────────────────────────────────────────────

const ORG = 'org-abc'
const FROM = new Date('2024-01-01')
const TO = new Date('2024-01-31')

function makeSelectChain(rows: unknown[]): ReturnType<typeof mockSelect> {
  const limitMock = mock(async () => rows)
  const orderByMock = mock(() => ({ limit: limitMock }))
  const groupByMock = mock(() => ({ orderBy: orderByMock }))
  const whereMock = mock(() => ({ groupBy: groupByMock }))
  const fromMock = mock(() => ({ where: whereMock }))
  return { from: fromMock } as unknown as ReturnType<typeof mockSelect>
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getAnalytics', () => {
  beforeEach(() => {
    mockExecute.mockReset()
    mockSelect.mockReset()
  })

  it('returns empty arrays when no data exists', async () => {
    mockExecute.mockImplementation(async () => [])
    mockSelect.mockImplementation(() => makeSelectChain([]))

    const result = await getAnalytics(ORG, undefined, FROM, TO)

    expect(result.dailyFailureRate).toEqual([])
    expect(result.mttrByWorkflow).toEqual([])
    expect(result.topFailingWorkflows).toEqual([])
    expect(result.topFailedSteps).toEqual([])
    expect(result.summary.totalIncidents).toBe(0)
    expect(result.summary.resolvedIncidents).toBe(0)
    expect(result.summary.avgConfidence).toBeNull()
    expect(result.summary.resolutionRate).toBeNull()
  })

  it('maps daily failure rate rows correctly', async () => {
    const dailyRows = [
      { date: '2024-01-05', total: '10', failed: '3' },
      { date: '2024-01-06', total: '8', failed: '0' },
    ]

    let callCount = 0
    mockExecute.mockImplementation(async () => {
      callCount++
      // 1st call = daily rows, 2nd = mttr, 3rd = summary
      if (callCount === 1) return dailyRows
      if (callCount === 3) return [{ total_incidents: '0', resolved_incidents: '0', avg_confidence: null }]
      return []
    })
    mockSelect.mockImplementation(() => makeSelectChain([]))

    const result = await getAnalytics(ORG, undefined, FROM, TO)

    expect(result.dailyFailureRate).toHaveLength(2)
    expect(result.dailyFailureRate[0]).toEqual({ date: '2024-01-05', total: 10, failed: 3, failureRate: 0.3 })
    expect(result.dailyFailureRate[1]).toEqual({ date: '2024-01-06', total: 8, failed: 0, failureRate: 0 })
  })

  it('maps MTTR rows and rounds to integer seconds', async () => {
    let callCount = 0
    mockExecute.mockImplementation(async () => {
      callCount++
      if (callCount === 2) {
        return [{ workflow_name: 'CI', avg_mttr_seconds: '127.6', incident_count: '4' }]
      }
      if (callCount === 3) return [{ total_incidents: '0', resolved_incidents: '0', avg_confidence: null }]
      return []
    })
    mockSelect.mockImplementation(() => makeSelectChain([]))

    const result = await getAnalytics(ORG, undefined, FROM, TO)

    expect(result.mttrByWorkflow).toHaveLength(1)
    expect(result.mttrByWorkflow[0]).toEqual({ workflowName: 'CI', avgMttrSeconds: 128, incidentCount: 4 })
  })

  it('computes summary counts and resolution rate', async () => {
    let callCount = 0
    mockExecute.mockImplementation(async () => {
      callCount++
      if (callCount === 3) {
        return [{ total_incidents: '20', resolved_incidents: '15', avg_confidence: '0.82' }]
      }
      return []
    })
    mockSelect.mockImplementation(() => makeSelectChain([]))

    const result = await getAnalytics(ORG, undefined, FROM, TO)

    expect(result.summary.totalIncidents).toBe(20)
    expect(result.summary.resolvedIncidents).toBe(15)
    expect(result.summary.avgConfidence).toBeCloseTo(0.82)
    expect(result.summary.resolutionRate).toBeCloseTo(0.75)
  })

  it('sets resolutionRate to null when no incidents', async () => {
    mockExecute.mockImplementation(async () => [
      { total_incidents: '0', resolved_incidents: '0', avg_confidence: null },
    ])
    mockSelect.mockImplementation(() => makeSelectChain([]))

    const result = await getAnalytics(ORG, undefined, FROM, TO)

    expect(result.summary.resolutionRate).toBeNull()
  })

  it('maps top failing workflows from ORM query', async () => {
    let selectCall = 0
    mockExecute.mockImplementation(async () => [
      { total_incidents: '0', resolved_incidents: '0', avg_confidence: null },
    ])
    mockSelect.mockImplementation(() => {
      selectCall++
      if (selectCall === 1) {
        return makeSelectChain([
          { workflowName: 'deploy', repo: 'acme/api', failureCount: '7' },
          { workflowName: 'test', repo: 'acme/api', failureCount: '3' },
        ])
      }
      return makeSelectChain([])
    })

    const result = await getAnalytics(ORG, undefined, FROM, TO)

    expect(result.topFailingWorkflows).toHaveLength(2)
    expect(result.topFailingWorkflows[0]).toEqual({ workflowName: 'deploy', repo: 'acme/api', failureCount: 7 })
  })

  it('maps top failed steps and skips null steps', async () => {
    let selectCall = 0
    mockExecute.mockImplementation(async () => [
      { total_incidents: '0', resolved_incidents: '0', avg_confidence: null },
    ])
    mockSelect.mockImplementation(() => {
      selectCall++
      if (selectCall === 2) {
        return makeSelectChain([
          { failedStep: 'Run tests', count: '12' },
          { failedStep: null, count: '5' },
        ])
      }
      return makeSelectChain([])
    })

    const result = await getAnalytics(ORG, undefined, FROM, TO)

    expect(result.topFailedSteps).toHaveLength(1)
    expect(result.topFailedSteps[0]).toEqual({ failedStep: 'Run tests', count: 12 })
  })

  it('handles missing summary row gracefully (empty DB)', async () => {
    mockExecute.mockImplementation(async () => [])
    mockSelect.mockImplementation(() => makeSelectChain([]))

    const result = await getAnalytics(ORG, undefined, FROM, TO)

    expect(result.summary.totalIncidents).toBe(0)
    expect(result.summary.resolutionRate).toBeNull()
  })
})
