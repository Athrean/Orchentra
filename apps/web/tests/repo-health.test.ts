import { describe, expect, test } from 'bun:test'
import type { RepoInsights, WorkflowRunSummary } from '../lib/github/repo-insights'
import { aggregateRepoHealthRows, findRepositoriesNeedingAttention } from '../lib/graph/repo-health'

function run(overrides: Partial<WorkflowRunSummary>): WorkflowRunSummary {
  return {
    id: 1,
    name: 'CI',
    status: 'completed',
    conclusion: 'success',
    htmlUrl: '',
    createdAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:05:00Z',
    durationMs: 300_000,
    repoFullName: 'acme/api',
    headBranch: 'main',
    headSha: 'abc',
    event: 'push',
    ...overrides,
  }
}

function insights(overrides: Partial<RepoInsights>): RepoInsights {
  return { repoFullName: 'acme/api', runs: [], total: 0, failures: 0, successes: 0, ...overrides }
}

describe('aggregateRepoHealthRows', () => {
  test('computes success rate, avg duration, last activity, and merges graph mttr', () => {
    const rows = aggregateRepoHealthRows(
      [
        insights({
          repoFullName: 'acme/api',
          runs: [
            run({ id: 2, createdAt: '2026-05-22T00:00:00Z', durationMs: 100_000 }),
            run({ id: 1, createdAt: '2026-05-20T00:00:00Z', durationMs: 300_000 }),
          ],
          total: 4,
          failures: 1,
          successes: 3,
        }),
      ],
      new Map([['acme/api', 420]]),
    )
    expect(rows[0].successRate).toBe(0.75)
    expect(rows[0].avgDurationMs).toBe(200_000)
    expect(rows[0].lastActivity?.toISOString()).toBe('2026-05-22T00:00:00.000Z')
    expect(rows[0].mttrSeconds).toBe(420)
  })

  test('orders repos by run volume and null-safe rate for zero runs', () => {
    const rows = aggregateRepoHealthRows(
      [
        insights({ repoFullName: 'acme/quiet', total: 0 }),
        insights({ repoFullName: 'acme/busy', runs: [run({})], total: 10, successes: 10 }),
      ],
      new Map(),
    )
    expect(rows.map((r) => r.repo)).toEqual(['acme/busy', 'acme/quiet'])
    expect(rows[1].successRate).toBeNull()
    expect(rows[1].mttrSeconds).toBeNull()
  })
})

describe('findRepositoriesNeedingAttention', () => {
  test('keeps only failing repos below the success threshold, worst first', () => {
    const rows = aggregateRepoHealthRows(
      [
        insights({ repoFullName: 'acme/healthy', runs: [run({})], total: 10, successes: 10, failures: 0 }),
        insights({ repoFullName: 'acme/shaky', runs: [run({})], total: 10, successes: 7, failures: 3 }),
        insights({ repoFullName: 'acme/broken', runs: [run({})], total: 10, successes: 2, failures: 8 }),
      ],
      new Map(),
    )
    const attention = findRepositoriesNeedingAttention(rows)
    expect(attention.map((r) => r.repo)).toEqual(['acme/broken', 'acme/shaky'])
  })
})
