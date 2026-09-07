/**
 * Local SG5 runtime microbenchmark. Run: bun scripts/measure-rlm-sg5.ts
 * No model, credentials, network, or filesystem tool work. Results describe
 * scheduler/REPL overhead on delayed fixture calls, not model task quality.
 */
import { performance } from 'node:perf_hooks'
import { RunContextStore } from '../packages/cli-core/src/runtime/context-store'
import { RlmProgramEnvironment } from '../packages/cli-core/src/runtime/program-environment'
import {
  SpeculativeToolBroker,
  type SpeculativeToolAttemptRecord,
} from '../packages/cli-core/src/runtime/speculative-tools'
import type { ToolSchedulingMetadata } from '../packages/cli-core/src/runtime/tools'

const delayMs = 20
const operations = 8
const trials = 5
const safe: ToolSchedulingMetadata = {
  pure: true,
  idempotent: true,
  concurrencySafe: true,
  speculativeSafe: true,
  resourceClass: 'compute',
}
const delay = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, delayMs))
const code = `(async () => Promise.all(Array.from({length: ${operations}}, (_, i) => tools.call('fixture', {i}))))()`

async function measure(parallel: boolean): Promise<number[]> {
  const samples = []
  for (let trial = 0; trial < trials; trial++) {
    let active = 0
    let peak = 0
    const environment = new RlmProgramEnvironment({
      contextStore: new RunContextStore(`benchmark-${parallel}-${trial}`),
      listTools: () => [],
      toolScheduling: () => ({ ...safe, concurrencySafe: parallel }),
      callTool: async (_name, input) => {
        active++
        peak = Math.max(peak, active)
        await delay()
        active--
        return { id: String((input as { i: number }).i), content: JSON.stringify(input), isError: false }
      },
    })
    try {
      // Initialization is measured separately from scheduling; both modes use
      // the identical QuickJS instance contract and code.
      const initializationStart = performance.now()
      await environment.execute('0')
      const initializationMs = performance.now() - initializationStart
      const started = performance.now()
      const result = await environment.execute(code)
      const latencyMs = performance.now() - started
      const expected = Array.from({ length: operations }, (_, i) => JSON.stringify({ i }))
      const contents = (result.value as Array<{ content: string }>).map((value) => value.content)
      if (JSON.stringify(contents) !== JSON.stringify(expected) || active !== 0 || peak > 4) {
        throw new Error('scheduler correctness/admission check failed')
      }
      samples.push({ latencyMs, initializationMs, peakConcurrent: peak, scheduler: result.scheduler })
    } finally {
      await environment.close()
    }
  }
  const sorted = samples.map((sample) => sample.latencyMs).sort((a, b) => a - b)
  return { medianLatencyMs: sorted[Math.floor(trials / 2)]!, samples }
}

async function measureSpeculation(matched: boolean): Promise<SpeculativeToolAttemptRecord[]> {
  const records: SpeculativeToolAttemptRecord[] = []
  const broker = new SpeculativeToolBroker({
    enabled: true,
    scheduling: () => safe,
    execute: async () => {
      await delay()
      return { result: { id: 'fixture', content: 'ok', isError: false }, reusable: true }
    },
    onAttempt: (record) => {
      records.push(record)
    },
  })
  const predictedCode = '(async () => tools.call("fixture", {"i":1}))()'
  broker.observe('outer', 'rlm_execute', JSON.stringify({ code: predictedCode }))
  await delay()
  const binding = broker.bind('outer', 'rlm_execute', { code: matched ? predictedCode : '0' })
  if (matched && (await binding?.consume('fixture', { i: 1 }))?.content !== 'ok') {
    throw new Error('speculation match failed')
  }
  await binding?.finish()
  await broker.close()
  return records[0]!
}

const serial = await measure(false)
const parallel = await measure(true)
const matched = await measureSpeculation(true)
const discarded = await measureSpeculation(false)
console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      measuredAt: new Date().toISOString(),
      scope: 'local synthetic runtime microbenchmark; no provider or model quality comparison',
      runtime: Bun.version,
      fixture: { operations, delayMs, trials, maxConcurrent: 4 },
      serial,
      parallel,
      medianSpeedup: serial.medianLatencyMs / parallel.medianLatencyMs,
      correctness: 'identical ordered results; all work settled; peak concurrency <= 4',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      cacheHitRate: null,
      providerCostUsd: 0,
      speculation: { matched, discarded },
      promotion: {
        eligible: false,
        reason: 'live model baseline, task quality and provider cache evidence remain pending',
      },
    },
    null,
    2,
  ),
)
