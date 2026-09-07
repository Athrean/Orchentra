/** Scripted-provider direct/RLM comparison. No API calls or credentials. */
import {
  ConversationRuntime,
  buildSystemPrompt,
  metricsFromManifest,
  buildScoreboard,
  assessExecutionPromotion,
  type TraceManifest,
  type ToolDefinition,
} from '../packages/cli-core/src'
import { DefaultToolRegistry } from '../packages/cli-tools/src/tool-registry'
import { rlmExecuteTool } from '../packages/cli-tools/src/tools/rlm-execute-tool'
const labels = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel']

async function run(profile: 'direct' | 'rlm'): Promise<EvalScoreboard> {
  const samples = []
  for (let trial = 0; trial < 3; trial++) {
    const values: number[] = []
    const errors: string[] = []
    let step = 0
    let active = 0
    let peak = 0
    let manifest: TraceManifest | undefined
    const fixture: ToolDefinition = {
      name: 'fixture',
      description: 'independent delayed fixture',
      level: 'read',
      scheduling: {
        pure: true,
        idempotent: true,
        concurrencySafe: true,
        speculativeSafe: false,
        resourceClass: 'compute',
      },
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      async execute(input) {
        active++
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 20))
        active--
        const value = labels.indexOf((input as { path: string }).path) * 2
        values.push(value)
        return { content: String(value), isError: false }
      },
    }
    const runtime = new ConversationRuntime(
      {
        model: 'scripted-fixture',
        executionProfile: profile,
        maxOutputTokens: 1024,
        contextWindowTokens: 100000,
        compactionThreshold: 0.9,
        keepRecentOnCompact: 4,
        budget: { maxSteps: 3, maxTokens: 10000 },
        cwd: '/tmp',
        sessionId: 'sg5-fixture',
      },
      {
        provider: {
          async *stream() {
            if (step++ === 0) {
              if (profile === 'direct') {
                for (let i = 0; i < 8; i++)
                  yield { kind: 'tool-use', call: { id: `call-${i}`, name: 'fixture', input: { path: labels[i] } } }
              } else {
                yield {
                  kind: 'tool-use',
                  call: {
                    id: 'program',
                    name: 'rlm_execute',
                    input: {
                      code: `(async () => Promise.all(${JSON.stringify(labels)}.map(path => tools.call("fixture", {path}))))()`,
                    },
                  },
                }
              }
              yield { kind: 'finish', stopReason: 'tool_use' }
            } else yield { kind: 'finish', stopReason: 'end_turn' }
          },
        },
        tools: new DefaultToolRegistry(profile === 'rlm' ? [fixture, rlmExecuteTool] : [fixture]),
        systemPrompt: buildSystemPrompt({ staticParts: ['fixture'], dynamicParts: [] }),
        traceSink: {
          append() {},
          finalize(value) {
            manifest = value
          },
        },
        onEvent(event) {
          if (event.kind === 'tool_result' && event.result.isError) errors.push(event.result.content)
        },
      },
    )
    for await (const event of runtime.run({ userMessage: 'double the integers zero through seven independently' }))
      void event
    if (
      !manifest ||
      manifest.doneReason !== 'stop' ||
      active !== 0 ||
      peak > 4 ||
      JSON.stringify(values.sort((a, b) => a - b)) !== JSON.stringify([0, 2, 4, 6, 8, 10, 12, 14])
    )
      throw new Error(
        `fixture correctness/cap failure: ${JSON.stringify({ profile, reason: manifest?.doneReason, values, errors, active, peak })}`,
      )
    samples.push({ trial, passed: true, exitCode: 0, timedOut: false, metrics: metricsFromManifest(manifest) })
  }
  return buildScoreboard(
    [
      {
        meta: {
          id: 'eight-independent-operations',
          category: 'coding',
          type: 'scripted-runtime',
          grader: 'test',
          k: 3,
          timeoutSec: 10,
          versionAdded: 'sg5',
        },
        trials: samples,
      },
    ],
    {
      model: 'scripted-fixture',
      harness: 'working-tree',
      corpus: 'scripts/measure-rlm-runtime.ts',
      executionProfile: profile,
    },
  )
}

const direct = await run('direct')
const rlm = await run('rlm')
const median = (board: typeof direct): number =>
  board.evals[0]!.trialResults!.map((t) => t.metrics.latencyMs!).sort((a, b) => a - b)[1]!
console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      measuredAt: new Date().toISOString(),
      runtime: Bun.version,
      scope: 'scripted-provider runtime comparison; no live model quality or provider cache evidence',
      actualProviderSpendUsd: 0,
      medianSpeedup: median(direct) / median(rlm),
      measurements: { direct, rlm },
      promotion: assessExecutionPromotion(direct, rlm, { liveProvider: false, regressionStatus: 'unknown' }),
    },
    null,
    2,
  ),
)
