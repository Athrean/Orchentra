// Deterministic scenario harness for the agent loop. Drives ConversationRuntime
// with a scripted provider (no network) and reports the run's aggregated outcome.
// Unlike a plain transcript fixture, scenarios also carry a *cost budget*
// (tokensMax / cacheHitMin) so the suite gates spend, not just behavior — see
// docs/CLI_UPGRADES.md H1.
import { ConversationRuntime, type ConversationConfig, type ConversationDeps } from '../../src/runtime/conversation'
import type { Provider, ProviderRequest, ProviderStreamEvent } from '../../src/runtime/provider'
import type { ToolRegistry, ToolResult } from '../../src/runtime/tools'
import { type RuntimeEvent, type DoneReason, type UsageTotals, emptyUsage, totalTokens } from '../../src/runtime/events'
import { buildSystemPrompt } from '../../src/runtime/system-prompt'

export interface ScenarioExpect {
  /** Expected DoneEvent reason. */
  done?: DoneReason
  /** Concatenated text deltas the run must produce. */
  transcript?: string
  /** Cost gate: total tokens (in+out+cache) must not exceed this. */
  tokensMax?: number
  /** Prefix-cache gate: cacheReadTokens must be at least this. */
  cacheHitMin?: number
}

export interface Scenario {
  name: string
  input: string
  /** Scripted provider output, one array of stream events per model turn. */
  turns: ProviderStreamEvent[][]
  tools?: ToolRegistry
  config?: Partial<ConversationConfig>
  /** Observes each provider request before scripted events are yielded. */
  onProviderRequest?: (request: ProviderRequest, callIndex: number) => void
  beforeProviderTurn?: (request: ProviderRequest, callIndex: number) => void | Promise<void>
  afterProviderTurn?: (request: ProviderRequest, callIndex: number) => void | Promise<void>
  expect: ScenarioExpect
}

export interface ScenarioResult {
  events: RuntimeEvent[]
  usage: UsageTotals
  totalTokens: number
  transcript: string
  doneReason: DoneReason
}

function scriptedProvider(
  turns: ProviderStreamEvent[][],
  onRequest?: (request: ProviderRequest, callIndex: number) => void,
  beforeTurn?: (request: ProviderRequest, callIndex: number) => void | Promise<void>,
  afterTurn?: (request: ProviderRequest, callIndex: number) => void | Promise<void>,
): Provider {
  let callIndex = 0
  return {
    async *stream(request) {
      const currentCall = callIndex++
      const snapshot = snapshotRequest(request)
      onRequest?.(snapshot, currentCall)
      const turn = turns[currentCall] ?? []
      try {
        await beforeTurn?.(snapshot, currentCall)
        for (const ev of turn) yield ev
      } finally {
        await afterTurn?.(snapshot, currentCall)
      }
    },
  }
}

function snapshotRequest(request: ProviderRequest): ProviderRequest {
  return {
    ...request,
    messages: request.messages.map((message) => ({
      ...message,
      toolCalls: message.toolCalls?.map((call) => ({ ...call })),
    })),
    tools: request.tools.map((tool) => ({ ...tool })),
  }
}

function noopTools(): ToolRegistry {
  return {
    list: () => [],
    has: () => false,
    execute: async (): Promise<ToolResult> => ({ content: 'noop', isError: false }),
  }
}

function makeConfig(overrides?: Partial<ConversationConfig>): ConversationConfig {
  return {
    model: 'test',
    maxOutputTokens: 1024,
    contextWindowTokens: 100000,
    compactionThreshold: 0.7,
    keepRecentOnCompact: 4,
    budget: { maxSteps: 10, maxTokens: 100000 },
    sessionId: 'scenario',
    cwd: '/tmp',
    ...overrides,
  }
}

/** Throws if the run violates any declared expectation, including the cost budget. */
export function assertScenario(s: Scenario, r: ScenarioResult): void {
  const e = s.expect
  if (e.tokensMax !== undefined && r.totalTokens > e.tokensMax) {
    throw new Error(`[${s.name}] tokensMax exceeded: ${r.totalTokens} > ${e.tokensMax}`)
  }
  if (e.transcript !== undefined && r.transcript !== e.transcript) {
    throw new Error(
      `[${s.name}] transcript mismatch: ${JSON.stringify(r.transcript)} !== ${JSON.stringify(e.transcript)}`,
    )
  }
  if (e.done !== undefined && r.doneReason !== e.done) {
    throw new Error(`[${s.name}] done reason mismatch: ${r.doneReason} !== ${e.done}`)
  }
  if (e.cacheHitMin !== undefined && r.usage.cacheReadTokens < e.cacheHitMin) {
    throw new Error(`[${s.name}] cacheHitMin not met: ${r.usage.cacheReadTokens} < ${e.cacheHitMin}`)
  }
}

export async function runScenario(s: Scenario): Promise<ScenarioResult> {
  const deps: ConversationDeps = {
    provider: scriptedProvider(s.turns, s.onProviderRequest, s.beforeProviderTurn, s.afterProviderTurn),
    tools: s.tools ?? noopTools(),
    systemPrompt: buildSystemPrompt({ staticParts: ['sys'], dynamicParts: [] }),
    // Keep scenarios off the real filesystem: no trace files, no tool-output
    // recovery writes. The no-op sink also propagates to sub-agents via
    // ToolContext, so concurrent fan-out ordering is microtask-deterministic
    // (real disk writes before the first provider call would race under load).
    traceSink: { append: () => {}, finalize: () => {} },
    persistToolOutput: async () => {},
  }
  const runtime = new ConversationRuntime(makeConfig(s.config), deps)

  const events: RuntimeEvent[] = []
  for await (const ev of runtime.run({ userMessage: s.input })) events.push(ev)

  const done = events.find((e): e is Extract<RuntimeEvent, { kind: 'done' }> => e.kind === 'done')
  const usage = done?.usage ?? emptyUsage()
  const transcript = events
    .filter((e): e is Extract<RuntimeEvent, { kind: 'text' }> => e.kind === 'text')
    .map((e) => e.delta)
    .join('')

  return {
    events,
    usage,
    totalTokens: totalTokens(usage),
    transcript,
    doneReason: done?.reason ?? 'error',
  }
}
