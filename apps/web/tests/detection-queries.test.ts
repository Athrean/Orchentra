import { describe, expect, test } from 'bun:test'
import { getUsageRange } from '../lib/graph/usage'
import {
  aggregateRepeatedFailures,
  formatFailureForChat,
  mapDetectionRow,
  median,
  summarizeDetections,
  type Detection,
} from '../lib/graph/detections'

function detection(overrides: Partial<Detection>): Detection {
  return {
    id: 'e1',
    repo: 'acme/api',
    branch: 'main',
    workflowName: 'CI',
    failedStep: null,
    status: 'investigating',
    confidence: null,
    rootCause: null,
    suggestedFix: null,
    githubPrUrl: null,
    githubIssueUrl: null,
    mttrSeconds: null,
    occurredAt: new Date('2026-05-20T00:00:00Z'),
    resolved: false,
    ...overrides,
  }
}

describe('median', () => {
  test('null for empty', () => expect(median([])).toBeNull())
  test('middle value for odd length', () => expect(median([30, 10, 20])).toBe(20))
  test('rounded mean of middle two for even length', () => expect(median([10, 20, 30, 40])).toBe(25))
})

describe('mapDetectionRow', () => {
  test('maps snake_case db row and derives resolved from resolved_at', () => {
    const row = mapDetectionRow({
      id: 7,
      repo: 'acme/api',
      branch: 'main',
      workflow_name: 'Deploy',
      failed_step: 'build',
      status: 'resolved',
      confidence: 0.8,
      root_cause: 'flaky test',
      suggested_fix: 'retry',
      github_pr_url: 'https://x/pr/1',
      github_issue_url: null,
      mttr_seconds: 600,
      resolved_at: '2026-05-20T01:00:00Z',
      occurred_at: '2026-05-20T00:00:00Z',
    })
    expect(row.id).toBe('7')
    expect(row.failedStep).toBe('build')
    expect(row.confidence).toBe(0.8)
    expect(row.mttrSeconds).toBe(600)
    expect(row.resolved).toBe(true)
  })

  test('resolved is false when resolved_at is null', () => {
    expect(
      mapDetectionRow({ id: 1, repo: 'a/b', resolved_at: null, occurred_at: '2026-05-20T00:00:00Z' }).resolved,
    ).toBe(false)
  })
})

describe('summarizeDetections', () => {
  const range = getUsageRange('7d', new Date('2026-05-22T12:00:00Z'))

  test('counts total, open, resolved and median mttr', () => {
    const summary = summarizeDetections(
      [
        detection({ id: 'a', resolved: true, mttrSeconds: 100, occurredAt: new Date('2026-05-20T00:00:00Z') }),
        detection({ id: 'b', resolved: false, mttrSeconds: 300, occurredAt: new Date('2026-05-21T00:00:00Z') }),
        detection({ id: 'c', resolved: false, mttrSeconds: null, occurredAt: new Date('2026-05-21T00:00:00Z') }),
      ],
      range,
    )
    expect(summary.total).toBe(3)
    expect(summary.open).toBe(2)
    expect(summary.resolved).toBe(1)
    expect(summary.mttrP50Seconds).toBe(200)
  })

  test('byDay spans the full range and buckets by occurrence day', () => {
    const summary = summarizeDetections([detection({ occurredAt: new Date('2026-05-21T08:00:00Z') })], range)
    expect(summary.byDay.length).toBe(7)
    expect(summary.byDay.find((d) => d.day === '2026-05-21')?.count).toBe(1)
  })
})

describe('formatFailureForChat', () => {
  test('maps to compact chat shape; resolved overrides status; iso timestamp', () => {
    const out = formatFailureForChat(
      detection({
        resolved: true,
        status: 'investigating',
        workflowName: 'CI',
        failedStep: 'build',
        rootCause: 'flaky',
        suggestedFix: 'retry',
        occurredAt: new Date('2026-05-20T00:00:00Z'),
      }),
    )
    expect(out.status).toBe('resolved')
    expect(out.workflow).toBe('CI')
    expect(out.failedStep).toBe('build')
    expect(out.occurredAt).toBe('2026-05-20T00:00:00.000Z')
  })
})

describe('aggregateRepeatedFailures', () => {
  test('groups by repo+workflow+failedStep, keeps recurring, newest timestamp wins', () => {
    const repeated = aggregateRepeatedFailures([
      detection({ workflowName: 'CI', failedStep: 'test', occurredAt: new Date('2026-05-20T00:00:00Z') }),
      detection({ workflowName: 'CI', failedStep: 'test', occurredAt: new Date('2026-05-22T00:00:00Z') }),
      detection({ workflowName: 'CI', failedStep: 'lint', occurredAt: new Date('2026-05-21T00:00:00Z') }),
    ])
    expect(repeated).toHaveLength(1)
    expect(repeated[0]).toMatchObject({ workflow: 'CI', failedStep: 'test', count: 2 })
    expect(repeated[0].lastOccurredAt.toISOString()).toBe('2026-05-22T00:00:00.000Z')
  })

  test('sorts by frequency descending', () => {
    const repeated = aggregateRepeatedFailures(
      [
        detection({ repo: 'a/one', workflowName: 'X', failedStep: 's' }),
        detection({ repo: 'a/two', workflowName: 'Y', failedStep: 's' }),
        detection({ repo: 'a/two', workflowName: 'Y', failedStep: 's' }),
        detection({ repo: 'a/two', workflowName: 'Y', failedStep: 's' }),
      ],
      1,
    )
    expect(repeated.map((r) => r.repo)).toEqual(['a/two', 'a/one'])
  })
})
