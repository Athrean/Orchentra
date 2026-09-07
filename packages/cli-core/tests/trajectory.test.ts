import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileTraceSink, traceEventsPath, type TraceManifest } from '../src/runtime/trace'
import { loadTrajectory, parseTraceEvents, renderTrajectory } from '../src/runtime/trajectory'
import { emptyUsage } from '../src/runtime/events'

function manifest(traceId: string): TraceManifest {
  return {
    schemaVersion: 2,
    optimization: null,
    traceId,
    sessionId: 's',
    task: 'fixture',
    model: 'unknown-model',
    provider: null,
    harnessVersion: null,
    executionProfile: 'rlm',
    systemPromptVersion: 'prefix',
    promptPartitionHashes: { static: 's', trustedDynamic: 'd', untrustedReference: 'u' },
    toolDefinitionsHash: 'tools',
    startedAt: '2026-09-06T00:00:00Z',
    endedAt: '2026-09-06T00:00:01Z',
    latencyMs: 1000,
    doneReason: 'stop',
    steps: 1,
    usage: emptyUsage(),
    billedTokens: 0,
    cachedTokens: 0,
    estimatedCostUsd: undefined,
    contextSizeCurve: [],
    modelCallLatenciesMs: [],
    retries: null,
    loopDetections: 0,
    compactions: [],
    subAgentTraceIds: [],
    filesChanged: [],
    quirks: {},
    eventCounts: {},
    browserState: null,
    screenshots: null,
    consoleErrors: null,
    networkFailures: null,
    testResults: null,
    gateDecisions: null,
    graderResult: null,
    failureCategory: null,
  }
}
const job = { model: 'unknown-model', depth: 1, attempt: 1, startedAt: '2026-09-06T00:00:00Z' }

describe('recursive trajectories', () => {
  test('replays live and cold nested traces with failed/cancelled branches, handles and exact evidence', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'orchentra-tree-'))
    try {
      const root = new FileTraceSink(cwd, 'root')
      const child = new FileTraceSink(cwd, 'child')
      await root.append({ kind: 'run_identity', traceId: 'root', model: 'unknown-model', startedAt: job.startedAt })
      await root.append({
        kind: 'model_job',
        job: { ...job, jobId: 'recursive', callKind: 'recursive', status: 'running' },
      })
      await child.append({ kind: 'run_identity', traceId: 'child', model: 'unknown-model', startedAt: job.startedAt })
      await root.append({ kind: 'recursive_link', jobId: 'recursive', attempt: 1, childTraceId: 'child', depth: 1 })
      expect((await loadTrajectory(cwd, 'root')).complete).toBe(false)
      expect((await loadTrajectory(cwd, 'root')).root.children[0]!.traceId).toBe('child')
      await child.append({
        kind: 'model_job',
        job: {
          ...job,
          depth: 2,
          jobId: 'leaf',
          callKind: 'leaf',
          status: 'failed',
          usage: emptyUsage(),
          endedAt: '2026-09-06T00:00:01Z',
        },
      })
      await child.append({ kind: 'context_access', operationId: 'op', operation: 'read', handle: 'ctx_fixture' })
      await child.append({
        kind: 'permission_decision',
        tool: 'write',
        toolCallId: 'denied',
        decision: 'deny',
        reason: 'fixture',
      })
      await child.append({
        kind: 'tool_result',
        result: {
          id: 'proof',
          content: 'checked',
          isError: false,
          evidence: [{ kind: 'test', summary: 'passed' }],
          artifacts: [{ kind: 'file', uri: '/tmp/proof.txt', action: 'created' }],
        },
      })
      await child.finalize(manifest('child'))
      await root.append({
        kind: 'model_job',
        job: { ...job, jobId: 'recursive', callKind: 'recursive', status: 'completed', traceId: 'child' },
      })
      await root.append({
        kind: 'model_job',
        job: { ...job, jobId: 'cancelled', callKind: 'leaf', status: 'cancelled' },
      })
      await root.finalize(manifest('root'))
      const first = await loadTrajectory(cwd, 'root')
      const cold = await loadTrajectory(cwd, 'root')
      expect(cold).toEqual(first)
      expect(cold.complete).toBe(true)
      expect(cold.root.children[0]!.children[0]!.status).toBe('failed')
      expect(cold.root.children[1]!.status).toBe('cancelled')
      expect(cold.root.children[0]).toMatchObject({
        contextHandles: ['ctx_fixture'],
        evidenceCount: 1,
        artifacts: ['/tmp/proof.txt'],
        permissionDenials: 1,
      })
      expect(renderTrajectory(cold)).toContain('[failed]')
      expect(renderTrajectory(cold)).toContain('[cancelled]')
      expect(renderTrajectory(cold)).toContain('cost=unknown')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('orders concurrent writes, redacts new records and validates migrated/current sequences', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'orchentra-tree-order-'))
    try {
      const sink = new FileTraceSink(cwd, 'ordered')
      await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          sink.append({
            kind: 'context_access',
            operationId: String(i),
            operation: 'read',
            handle: `sk-${'a'.repeat(30)}`,
          }),
        ),
      )
      const raw = await readFile(traceEventsPath(cwd, 'ordered'), 'utf8')
      expect(raw).not.toContain(`sk-${'a'.repeat(30)}`)
      const events = parseTraceEvents(raw, 'ordered')
      expect(events).toHaveLength(12)
      expect(events.map((e) => e.kind === 'context_access' && e.operationId)).toEqual(
        Array.from({ length: 12 }, (_, i) => String(i)),
      )
      expect(parseTraceEvents('{"kind":"text","delta":"legacy"}')).toHaveLength(1)
      expect(parseTraceEvents('{"kind":"text","delta":"legacy"}\n{"kind":')).toHaveLength(1)
      expect(() => parseTraceEvents('{"kind":"text","traceVersion":3}\n')).toThrow('unsupported')
      expect(() => parseTraceEvents('{"kind":"text","traceVersion":2,"sequence":2}\n')).toThrow('sequence')
      await expect(loadTrajectory(cwd, '../outside')).rejects.toThrow('invalid trace id')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
