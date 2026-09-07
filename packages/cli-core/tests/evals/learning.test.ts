import { describe, expect, test } from 'bun:test'
import { appendFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FileTraceSink, traceEventsPath, type TraceManifest } from '../../src/runtime/trace'
import { emptyUsage } from '../../src/runtime/events'
import { exportLearningTrajectory, parseLearningExport } from '../../src/evals/learning-export'
import { scoreLearningTrajectory, type LearningRewardInput } from '../../src/evals/learning-rewards'

function manifest(traceId: string): TraceManifest {
  return {
    schemaVersion: 2,
    optimization: null,
    traceId,
    sessionId: 's',
    task: 'fixture',
    model: 'fixture-model',
    provider: 'fixture',
    harnessVersion: 'fixture',
    executionProfile: 'rlm',
    systemPromptVersion: 'prefix',
    promptPartitionHashes: { static: 's', trustedDynamic: 'd', untrustedReference: 'u' },
    toolDefinitionsHash: 'tools',
    startedAt: '2026-09-07T00:00:00Z',
    endedAt: '2026-09-07T00:00:01Z',
    latencyMs: 1000,
    doneReason: 'stop',
    steps: 1,
    usage: emptyUsage(),
    billedTokens: 0,
    cachedTokens: 0,
    estimatedCostUsd: 0.1,
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

async function fixture(cwd: string): Promise<FileTraceSink> {
  const root = new FileTraceSink(cwd, 'root')
  const child = new FileTraceSink(cwd, 'child')
  const job = {
    jobId: 'child-job',
    model: 'fixture-model',
    depth: 1,
    attempt: 1,
    startedAt: '2026-09-07T00:00:00Z',
    callKind: 'recursive' as const,
  }
  await root.append({ kind: 'user_message', content: 'root task' })
  await root.append({ kind: 'model_job', job: { ...job, status: 'running' } })
  await root.append({ kind: 'recursive_link', jobId: job.jobId, attempt: 1, depth: 1, childTraceId: 'child' })
  await child.append({ kind: 'reasoning', delta: 'PRIVATE_PROVIDER_REASONING' })
  const binary = 'YWJjZGVmZ2hpamtsbW5vcA=='
  await child.append({
    kind: 'tool_result',
    result: {
      id: 'image',
      content: `copied image ${binary}`,
      images: [{ data: binary, mediaType: 'image/png' }],
      isError: true,
      data: { apiKey: 'plain-sensitive-value' },
      artifacts: [{ uri: '/not-read/private.png', kind: 'screenshot', action: 'created' }],
    },
  })
  await child.append({
    kind: 'transcript_snapshot',
    messages: [
      {
        role: 'assistant',
        content: 'failed attempt',
        thinking: [{ thinking: 'PRIVATE_SIGNED_REASONING', signature: 'PRIVATE_SIGNATURE' }],
      },
    ],
  })
  await child.append({ kind: 'done', reason: 'error', usage: emptyUsage() })
  await child.finalize({ ...manifest('child'), doneReason: 'error', failureCategory: 'error' })
  await root.append({ kind: 'model_job', job: { ...job, status: 'failed', traceId: 'child' } })
  await root.append({ kind: 'done', reason: 'stop', usage: emptyUsage() })
  await root.finalize({ ...manifest('root'), subAgentTraceIds: ['child'] })
  return root
}

function rewardInput(datasetHash: string): LearningRewardInput {
  const label = { verifier: 'fixture-grader', version: '1', artifactSha256: 'a'.repeat(64), score: 1 }
  return {
    schemaVersion: 1,
    datasetHash,
    labels: { correctness: label, decomposition: label, evidenceQuality: label },
    limits: { maxDepth: 2, maxConcurrentJobsPerRuntime: 4, maxTokens: 1000, maxCostUsd: 1, maxLatencyMs: 2000 },
  }
}

describe('explicit local RLM learning records', () => {
  test('exports all sealed branches with stable integrity hashes, redaction, and intentional omissions', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'orchentra-learning-'))
    try {
      await fixture(cwd)
      const data = await exportLearningTrajectory(cwd, 'root', '2026-09-07T00:00:00Z')
      expect(data.runs.map((run) => run.traceId)).toEqual(['root', 'child'])
      expect(data.runs[1]!.manifest.doneReason).toBe('error')
      expect(data.runs[1]!.parentTraceId).toBe('root')
      const text = JSON.stringify(data)
      for (const sensitive of [
        'PRIVATE_PROVIDER_REASONING',
        'PRIVATE_SIGNED_REASONING',
        'PRIVATE_SIGNATURE',
        'plain-sensitive-value',
        'YWJjZGVmZ2hpamtsbW5vcA==',
      ])
        expect(text).not.toContain(sensitive)
      expect(text).toContain('<REDACTED>')
      expect(text).toContain('<IMAGE_OMITTED>')
      expect(text).toContain('/not-read/private.png')
      expect(parseLearningExport(JSON.parse(text))).toEqual(data)
      expect((await exportLearningTrajectory(cwd, 'root')).datasetHash).toBe(data.datasetHash)
      expect(() => parseLearningExport({ ...data, schemaVersion: 2 })).toThrow('newer')
      const modified = JSON.parse(text)
      modified.runs[0].manifest.task = 'tampered'
      expect(() => parseLearningExport(modified)).toThrow('hash mismatch')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('rejects unfinished, missing, invalid-identity, and truncated sealed records', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'orchentra-learning-bad-'))
    try {
      const sink = new FileTraceSink(cwd, 'unfinished')
      await sink.append({ kind: 'text', delta: 'still working' })
      await expect(exportLearningTrajectory(cwd, 'unfinished')).rejects.toThrow()
      const root = await fixture(cwd)
      await root.finalize({ ...manifest('root'), subAgentTraceIds: ['missing'] })
      await expect(exportLearningTrajectory(cwd, 'root')).rejects.toThrow()
      await root.finalize({ ...manifest('root'), subAgentTraceIds: ['../outside'] })
      await expect(exportLearningTrajectory(cwd, 'root')).rejects.toThrow('invalid trace id')
      await root.finalize(manifest('root'))
      await appendFile(traceEventsPath(cwd, 'root'), '{"kind":')
      await expect(exportLearningTrajectory(cwd, 'root')).rejects.toThrow()
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('rewards require verifier provenance, correctness, bounds and known cost, not successful prose', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'orchentra-learning-reward-'))
    try {
      const root = await fixture(cwd)
      const data = await exportLearningTrajectory(cwd, 'root')
      const input = rewardInput(data.datasetHash)
      expect(scoreLearningTrajectory(data, input).total).toBeCloseTo(0.995)
      const unlabeled = scoreLearningTrajectory(data, { ...input, labels: {} })
      expect(unlabeled.total).toBeNull()
      expect(unlabeled.components.completion).toBeNull()
      expect(unlabeled.missing).toContain('decomposition')
      expect(
        scoreLearningTrajectory(data, {
          ...input,
          labels: { ...input.labels, correctness: { ...input.labels.correctness!, score: 0 } },
        }).total,
      ).toBe(0)
      expect(scoreLearningTrajectory(data, { ...input, limits: { ...input.limits, maxDepth: 0 } }).total).toBe(0)
      expect(scoreLearningTrajectory(data, { ...input, limits: { ...input.limits, maxLatencyMs: 1 } }).total).toBe(0)
      expect(() => scoreLearningTrajectory(data, { ...input, datasetHash: 'wrong' })).toThrow('mismatch')
      expect(() =>
        scoreLearningTrajectory(data, {
          ...input,
          labels: { correctness: { ...input.labels.correctness!, artifactSha256: '' } },
        }),
      ).toThrow('provenance')
      await root.finalize({ ...manifest('root'), estimatedCostUsd: undefined })
      const unknown = await exportLearningTrajectory(cwd, 'root')
      expect(scoreLearningTrajectory(unknown, rewardInput(unknown.datasetHash)).total).toBeNull()
      await root.finalize({
        ...manifest('root'),
        gateDecisions: [{ at: 'now', outcome: 'gate_failed', summary: 'failed', missingObligations: [], trials: [] }],
      })
      const gateFailed = await exportLearningTrajectory(cwd, 'root')
      expect(scoreLearningTrajectory(gateFailed, rewardInput(gateFailed.datasetHash)).total).toBe(0)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
