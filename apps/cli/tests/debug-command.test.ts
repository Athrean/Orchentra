import { describe, expect, test } from 'bun:test'
import { DebugCommand, type DebugDeps, type FailedRun } from '../src/commands/builtin/debug'
import { failureSignature } from '@orchentra/cli-core'
import type { CommandContext } from '../src/commands/registry'
import type { PatternEntry, SessionControl } from '@orchentra/cli-core'
import type { UiOutput } from '../src/commands/ui-output'

const RUN: FailedRun = {
  repo: 'acme/app',
  runId: 42,
  runUrl: 'https://github.com/acme/app/actions/runs/42',
  branch: 'main',
  workflowName: 'CI',
  jobName: 'test',
  log: 'Run tests\nError: connect ECONNREFUSED 127.0.0.1:5432\nexit code 1',
}

function makeCtx(): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  const session = { getModel: () => 'm', getUsage: () => ({}) } as unknown as SessionControl
  return { events, ctx: { cwd: '/w', session, ui: (o) => events.push(o) } }
}

function deps(over: Partial<DebugDeps>): DebugDeps {
  return {
    findLatestFailure: async () => RUN,
    loadMemories: () => [],
    ...over,
  }
}

function memoryFor(run: FailedRun, resolution: string): PatternEntry {
  const sig = failureSignature({ workflowName: run.workflowName, jobName: run.jobName, log: run.log })
  return {
    id: 'mem-1234abcd',
    orgId: 'default',
    incidentId: sig.hash,
    embedding: [],
    pattern: 'workflow: CI\njob: test',
    resolution,
    failureType: 'infra_timeout',
    usageCount: 1,
    lastMatchedAt: null,
    createdAt: '2026-06-20T00:00:00.000Z',
  }
}

describe('DebugCommand', () => {
  test('reports a helpful no-data state when no failed run is found', async () => {
    const { ctx, events } = makeCtx()
    await new DebugCommand(deps({ findLatestFailure: async () => null })).execute([], ctx)
    const ev = events[0]
    if (ev.kind !== 'note') throw new Error('expected note')
    expect(ev.text.toLowerCase()).toContain('no failed')
  })

  test('shows failure summary and error excerpt when no memory matches', async () => {
    const { ctx, events } = makeCtx()
    await new DebugCommand(deps({})).execute([], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    const text = JSON.stringify(ev)
    expect(text).toContain('acme/app')
    expect(text).toContain('CI')
    expect(text).toContain('ECONNREFUSED')
    expect(text.toLowerCase()).toContain('no matching memory')
  })

  test('surfaces a prior fix when a memory matches the failure signature', async () => {
    const { ctx, events } = makeCtx()
    await new DebugCommand(
      deps({ loadMemories: () => [memoryFor(RUN, 'Postgres was down; added a wait-for-db step.')] }),
    ).execute([], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    const text = JSON.stringify(ev)
    expect(text).toContain('wait-for-db')
    expect(text).toContain('mem-1234')
  })

  test('redacts secrets from the error excerpt', async () => {
    const runWithSecret: FailedRun = {
      ...RUN,
      log: 'Error: auth failed with token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    }
    const { ctx, events } = makeCtx()
    await new DebugCommand(deps({ findLatestFailure: async () => runWithSecret })).execute([], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    expect(JSON.stringify(ev)).not.toContain('ghp_ABCDEFG')
  })
})
