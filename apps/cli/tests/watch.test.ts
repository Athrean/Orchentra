import { describe, expect, test } from 'bun:test'
import { runWatch, type WatchEvent } from '../src/commands/watch'
import { OrgNotAllowedError } from '../src/commands/org-guard'

function makeEventLog(): { events: WatchEvent[]; push: (e: WatchEvent) => void } {
  const events: WatchEvent[] = []
  return { events, push: (e) => events.push(e) }
}

describe('runWatch', () => {
  test('detects failing workflow run and emits triage event', async () => {
    const log = makeEventLog()
    let pollCount = 0
    const code = await runWatch({
      repo: 'acme/api',
      intervalMs: 10,
      maxPolls: 2,
      resolveToken: () => ({ token: 'ghp_test', source: 'env' as const }),
      fetchRuns: async () => {
        pollCount++
        return [
          {
            id: 101,
            name: 'ci',
            head_branch: 'main',
            head_sha: 'abc123',
            event: 'push',
            status: 'completed' as const,
            conclusion: 'failure' as const,
            html_url: 'https://github.com/acme/api/actions/runs/101',
            workflow_id: 1,
          },
        ]
      },
      runTriage: async (_spec) => {
        return { posted: true, runId: 101 }
      },
      onEvent: log.push,
    })

    expect(code).toBe(0)
    expect(pollCount).toBeGreaterThanOrEqual(1)
    const triageEvent = log.events.find((e) => e.kind === 'triage')
    expect(triageEvent).toBeDefined()
    expect(triageEvent!.status).toBe('success')
  })

  test('skips already-seen run IDs', async () => {
    const log = makeEventLog()
    let triageCalls = 0
    const code = await runWatch({
      repo: 'acme/api',
      intervalMs: 10,
      maxPolls: 3,
      resolveToken: () => ({ token: 'ghp_test', source: 'env' as const }),
      fetchRuns: async () => [
        {
          id: 200,
          name: 'ci',
          head_branch: 'main',
          head_sha: 'abc',
          event: 'push',
          status: 'completed' as const,
          conclusion: 'failure' as const,
          html_url: 'https://github.com/acme/api/actions/runs/200',
          workflow_id: 1,
        },
      ],
      runTriage: async () => {
        triageCalls++
        return { posted: true, runId: 200 }
      },
      onEvent: log.push,
    })

    expect(code).toBe(0)
    expect(triageCalls).toBe(1)
  })

  test('retries on transient fetch failure', async () => {
    const log = makeEventLog()
    let callIndex = 0
    const code = await runWatch({
      repo: 'acme/api',
      intervalMs: 10,
      maxPolls: 3,
      resolveToken: () => ({ token: 'ghp_test', source: 'env' as const }),
      fetchRuns: async () => {
        callIndex++
        if (callIndex === 1) throw new Error('network timeout')
        return []
      },
      runTriage: async () => ({ posted: true, runId: 0 }),
      onEvent: log.push,
    })

    expect(code).toBe(0)
    const errorEvent = log.events.find((e) => e.kind === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent!.retryable).toBe(true)
  })

  test('returns 2 when org not allowed', async () => {
    const log = makeEventLog()
    const code = await runWatch({
      repo: 'other/api',
      intervalMs: 10,
      maxPolls: 1,
      resolveToken: () => ({ token: 'ghp_test', source: 'env' as const }),
      assertOrgAllowed: (_owner: string) => {
        throw new OrgNotAllowedError('other', ['acme'])
      },
      fetchRuns: async () => [],
      runTriage: async () => ({ posted: false, runId: 0 }),
      onEvent: log.push,
    })

    expect(code).toBe(2)
    const err = log.events.find((e) => e.kind === 'error')
    expect(err).toBeDefined()
  })

  test('retries triage on transient failure', async () => {
    const log = makeEventLog()
    let triageAttempts = 0
    const code = await runWatch({
      repo: 'acme/api',
      intervalMs: 10,
      maxPolls: 3,
      resolveToken: () => ({ token: 'ghp_test', source: 'env' as const }),
      fetchRuns: async () => [
        {
          id: 300,
          name: 'ci',
          head_branch: 'main',
          head_sha: 'abc',
          event: 'push',
          status: 'completed' as const,
          conclusion: 'failure' as const,
          html_url: 'https://github.com/acme/api/actions/runs/300',
          workflow_id: 1,
        },
      ],
      runTriage: async () => {
        triageAttempts++
        if (triageAttempts === 1) throw new Error('api timeout')
        return { posted: true, runId: 300 }
      },
      onEvent: log.push,
    })

    expect(code).toBe(0)
    expect(triageAttempts).toBe(2)
    const triageEvents = log.events.filter((e) => e.kind === 'triage')
    expect(triageEvents).toHaveLength(2)
    expect(triageEvents[0]!.status).toBe('failure')
    expect(triageEvents[1]!.status).toBe('success')
  })

  test('returns 1 for invalid repo format', async () => {
    const log = makeEventLog()
    const code = await runWatch({
      repo: 'bad-format',
      intervalMs: 10,
      maxPolls: 1,
      resolveToken: () => ({ token: 'ghp_test', source: 'env' as const }),
      fetchRuns: async () => [],
      runTriage: async () => ({ posted: false, runId: 0 }),
      onEvent: log.push,
    })

    expect(code).toBe(1)
    const err = log.events.find((e) => e.kind === 'error')
    expect(err).toBeDefined()
    expect(err!.message).toMatch(/invalid repo/)
  })

  test('returns 1 with error when token missing', async () => {
    const log = makeEventLog()
    const code = await runWatch({
      repo: 'acme/api',
      intervalMs: 10,
      maxPolls: 1,
      resolveToken: () => null,
      fetchRuns: async () => [],
      runTriage: async () => ({ posted: false, runId: 0 }),
      onEvent: log.push,
    })

    expect(code).toBe(1)
    const err = log.events.find((e) => e.kind === 'error')
    expect(err).toBeDefined()
    expect(err!.message).toMatch(/token/)
  })
})
