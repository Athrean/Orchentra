import { describe, expect, it } from 'bun:test'
import { aggregateUsageRows, getUsageRange, type UsageSourceRow } from '../lib/graph/usage'

const range = getUsageRange('7d', new Date('2026-05-27T12:00:00.000Z'))

function row(input: Partial<UsageSourceRow> & Pick<UsageSourceRow, 'id' | 'repo' | 'occurredAt'>): UsageSourceRow {
  return {
    modelId: 'anthropic/claude-sonnet-4-5',
    tokenInputs: 0,
    tokenOutputs: 0,
    estimatedCostUsd: 0,
    ...input,
  }
}

describe('aggregateUsageRows', () => {
  it('sums tokens and persisted cost over a range', () => {
    const result = aggregateUsageRows(
      [
        row({
          id: 'exec-1',
          repo: 'acme/app',
          occurredAt: new Date('2026-05-25T10:00:00.000Z'),
          tokenInputs: 100,
          tokenOutputs: 50,
          estimatedCostUsd: 0.12,
        }),
        row({
          id: 'exec-2',
          repo: 'acme/app',
          occurredAt: new Date('2026-05-25T11:00:00.000Z'),
          tokenInputs: 40,
          tokenOutputs: 10,
          estimatedCostUsd: 0.03,
        }),
      ],
      range,
      ['acme/app'],
    )

    expect(result.summary.totalInputTokens).toBe(140)
    expect(result.summary.totalOutputTokens).toBe(60)
    expect(result.summary.totalTokens).toBe(200)
    expect(result.summary.totalEstimatedCostUsd).toBe(0.15)
    expect(result.byDay.find((day) => day.day === '2026-05-25')?.totalTokens).toBe(200)
  })

  it('groups by repo and model', () => {
    const result = aggregateUsageRows(
      [
        row({
          id: 'exec-1',
          repo: 'acme/app',
          modelId: 'openai/gpt-4.1',
          occurredAt: new Date('2026-05-24T10:00:00Z'),
          tokenInputs: 10,
        }),
        row({
          id: 'exec-2',
          repo: 'acme/app',
          modelId: 'openai/gpt-4.1',
          occurredAt: new Date('2026-05-24T11:00:00Z'),
          tokenOutputs: 20,
        }),
        row({
          id: 'exec-3',
          repo: 'acme/api',
          modelId: null,
          occurredAt: new Date('2026-05-24T12:00:00Z'),
          tokenInputs: 30,
        }),
      ],
      range,
      ['acme/app', 'acme/api'],
    )

    expect(result.byRepoModel).toEqual([
      expect.objectContaining({ repo: 'acme/api', model: 'unknown', totalTokens: 30, executions: 1 }),
      expect.objectContaining({ repo: 'acme/app', model: 'openai/gpt-4.1', totalTokens: 30, executions: 2 }),
    ])
  })

  it('scopes reads to subscribed repos and the selected date range', () => {
    const result = aggregateUsageRows(
      [
        row({ id: 'exec-1', repo: 'acme/app', occurredAt: new Date('2026-05-23T10:00:00Z'), tokenInputs: 10 }),
        row({ id: 'exec-2', repo: 'acme/other', occurredAt: new Date('2026-05-23T10:00:00Z'), tokenInputs: 999 }),
        row({ id: 'exec-3', repo: 'acme/app', occurredAt: new Date('2026-05-01T10:00:00Z'), tokenInputs: 999 }),
      ],
      range,
      ['acme/app'],
    )

    expect(result.summary.totalTokens).toBe(10)
    expect(result.byRepoModel).toHaveLength(1)
    expect(result.byRepoModel[0].repo).toBe('acme/app')
  })
})
