import { createHash, randomUUID } from 'node:crypto'
import { RuntimeBudget, type BudgetConfig, type BudgetState } from './budget'
import {
  addUsage,
  emptyUsage,
  type DoneReason,
  type PermissionDecisionEvent,
  type RuntimeEvent,
  type SpanAttributeValue,
  type ToolArtifact,
  type ToolCall,
  type ToolResultPayload,
  type UsageTotals,
} from './events'
import { compact, compactWithSummary, shouldCompact, type LlmSummarizer, type TokenEstimator } from './compaction'
import { LoopDetector, type LoopDetectionConfig } from './loop-detector'
import type { QuirkCounters } from './quirks'
import { budgetToolOutput } from './tool-output-budget'
import { SNAPSHOT_CONTENT_MARKER, supersedeSnapshots } from './browser-context'
import { persistOriginalToolOutput, toolResultPath } from './tool-output-recovery'
import { appendCompactionNote, compactionNotesPath, renderCompactionNote } from './compaction-notes'
import { FileTraceSink, type TraceSink, type TraceManifest, type TestResultEntry } from './trace'
import type { ConsoleErrorEntry, FailedRequestEntry } from './browser'
import { billedTokens, cachedTokens, estimatedCostUsd } from './usage'
import type { ChatMessage, Provider, ProviderRequest, ProviderStreamEvent, ThinkingBlock } from './provider'
import type { EffortTier } from './provider'
import type { SystemPrompt } from './system-prompt'
import type { AskUserHandler, SharedToolState, ToolContext, ToolRegistry } from './tools'
import type { HookRunner } from './hooks'
import type { Enforcer } from '../permissions/enforcer'

function exhaustionReason(by: BudgetState['exhaustedBy']): DoneReason {
  if (by === 'steps') return 'max_steps'
  if (by === 'cost') return 'cost_exhausted'
  return 'budget_exhausted'
}

const PLAN_MODE_ALLOWED_TOOLS = new Set<string>(['exit_plan_mode', 'enter_plan_mode', 'todo_write'])

export interface ConversationConfig {
  model: string
  maxOutputTokens: number
  contextWindowTokens: number
  compactionThreshold: number
  keepRecentOnCompact: number
  /** Max chars of a tool result sent to the provider; over this it's trimmed (head+tail). 0 disables. */
  toolOutputBudgetChars?: number
  budget: BudgetConfig
  /**
   * Repeated-tool-call guardrail. Defaults on; set `repeatThreshold: 0` to
   * disable. See LoopDetector for the window semantics.
   */
  loopDetection?: LoopDetectionConfig
  sessionId: string
  cwd: string
  effort?: EffortTier
  thinkingTokenBudget?: number
  estimator?: TokenEstimator
  /** Provider backend name, recorded in the trace manifest when known. */
  providerName?: string
  /** Harness (CLI) version, recorded in the trace manifest when known. */
  harnessVersion?: string
}

export interface ConversationDeps {
  provider: Provider
  tools: ToolRegistry
  systemPrompt: SystemPrompt
  /**
   * Run-scoped budget shared across turns (and, via ToolContext, sub-agent
   * calls) within one invocation. When absent the runtime creates a
   * turn-scoped budget from `config.budget`.
   */
  budget?: RuntimeBudget
  hookRunner?: HookRunner
  enforcer?: Enforcer
  enforcerAskUser?: import('../permissions/enforcer').AskUser
  enforcerStore?: import('../permissions/store').PermissionStore
  enforcerNotifyDeny?: import('../permissions/enforcer').EnforcerContext['notifyDeny']
  enforcerPolicy?: import('../permissions/enforcer').EnforcerContext['policy']
  enforcerNotifyPolicy?: import('../permissions/enforcer').EnforcerContext['notifyPolicy']
  enforcerToolRequirements?: import('../permissions/enforcer').EnforcerContext['toolRequirements']
  permissionMode?: import('./permissions').PermissionMode
  spinePrompt?: string
  /**
   * Optional LLM-backed summarizer for compaction. When present, dropped turns
   * are summarized by the model instead of clipped-and-concatenated. Best-effort
   * and bounded — compaction falls back to the deterministic summary if it fails.
   */
  compactionSummarizer?: LlmSummarizer
  /**
   * Persists the untrimmed tool output so it can be read back later. Defaults
   * to writing under `<cwd>/.orchentra/sessions/<sessionId>/tool-results/`.
   * Injectable so tests/hosts can avoid real disk I/O or redirect storage.
   */
  persistToolOutput?: (path: string, content: string) => Promise<void>
  /** Override for tests; defaults to appending the note to the session's NOTES.md. */
  persistCompactionNote?: (path: string, note: string) => Promise<void>
  /**
   * Trace destination for this runtime's runs. Defaults to a FileTraceSink
   * writing per-run events.jsonl + manifest.json under
   * `.orchentra/traces/<run-id>/`, so every run — including sub-agent runs —
   * leaves an auditable trace unless a test injects a no-op.
   */
  traceSink?: TraceSink
  onEvent?: (event: RuntimeEvent) => void | Promise<void>
  signal?: AbortSignal
  clock?: () => string
  idGen?: () => string
  sharedState?: SharedToolState
  askUser?: AskUserHandler
  workspaceRoots?: readonly string[]
  /**
   * Nesting depth when this runtime drives a sub-agent. Forwarded into every
   * ToolContext so a nested `agent` call sees its own depth and the recursion
   * cap holds down the tree.
   */
  subagentDepth?: number
  /**
   * Run-wide per-model deviation counters (malformed args, unknown tools).
   * Forwarded into every ToolContext; pass the parent's instance into
   * sub-agent runtimes so one run accumulates one set of counters.
   */
  quirks?: QuirkCounters
}

export interface RunInput {
  userMessage: string
  priorMessages?: ChatMessage[]
  /** Compact prior context before this turn, regardless of threshold. */
  forceCompaction?: boolean
}

interface ActiveTrace {
  sink: TraceSink
  traceId: string
  startedAt: string
  task: string
  systemPromptVersion: string
  toolDefinitionsHash: string
  eventCounts: Record<string, number>
  contextSizeCurve: number[]
  // Open model_call spans (spanId → epoch ms) so span_end can close latency.
  modelCallStarts: Map<string, number>
  modelCallLatenciesMs: number[]
  compactions: { droppedMessageCount: number; tokensSaved: number }[]
  filesChanged: ToolArtifact[]
  subAgentTraceIds: string[]
  // M2 browser evidence, accumulated from tool-result evidence mid-stream.
  browserActive: boolean
  browserLastUrl: string | null
  browserNavigations: number
  browserConsoleErrors: ConsoleErrorEntry[]
  browserNetworkFailures: FailedRequestEntry[]
  browserConsoleSeen: Set<string>
  browserNetworkSeen: Set<string>
  screenshots: string[]
  testResults: TestResultEntry[]
}

function versionHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12)
}

export class ConversationRuntime {
  private finalMessages: ChatMessage[] = []
  // Per-run trace state; set at loop start so emit() can append every event.
  // A runtime never runs concurrently with itself, so one slot suffices.
  private trace: ActiveTrace | null = null
  private lastTraceIdValue: string | null = null

  constructor(
    private readonly config: ConversationConfig,
    private readonly deps: ConversationDeps,
  ) {}

  run(input: RunInput): AsyncIterable<RuntimeEvent> {
    return this.loop(input)
  }

  /**
   * Returns the final message list after `run()` has completed iterating.
   * Callers should treat this as read-only and use it to seed the next turn
   * so assistant and tool messages persist across turns.
   */
  getFinalMessages(): ChatMessage[] {
    return this.finalMessages
  }

  /**
   * Trace id of the most recent run (the run's directory name under
   * `.orchentra/traces/`). Hosts spawning this runtime — the agent tool in
   * particular — use it to link the child trace from the parent manifest.
   */
  get lastTraceId(): string | null {
    return this.lastTraceIdValue
  }

  private async *loop(input: RunInput): AsyncIterable<RuntimeEvent> {
    const budget = this.deps.budget ?? new RuntimeBudget(this.config.budget)
    budget.beginTurn()
    const loopDetector = new LoopDetector(this.config.loopDetection)
    const messages: ChatMessage[] = [...(input.priorMessages ?? [])]
    this.finalMessages = messages
    const { provider, tools, systemPrompt } = this.deps

    const traceId = this.newId()
    this.lastTraceIdValue = traceId
    this.trace = {
      sink: this.deps.traceSink ?? new FileTraceSink(this.config.cwd, traceId),
      traceId,
      startedAt: this.now(),
      task: input.userMessage,
      systemPromptVersion: versionHash(systemPrompt.static),
      toolDefinitionsHash: versionHash(JSON.stringify(tools.list())),
      eventCounts: {},
      contextSizeCurve: [],
      modelCallStarts: new Map(),
      modelCallLatenciesMs: [],
      compactions: [],
      filesChanged: [],
      subAgentTraceIds: [],
      browserActive: false,
      browserLastUrl: null,
      browserNavigations: 0,
      browserConsoleErrors: [],
      browserNetworkFailures: [],
      browserConsoleSeen: new Set(),
      browserNetworkSeen: new Set(),
      screenshots: [],
      testResults: [],
    }
    if (input.forceCompaction) {
      // Explicit compaction belongs to the runtime too: the same boundary is
      // persisted, emitted, session-recorded, and included in the manifest.
      // Keep the current user message outside the dropped history, matching
      // the command's existing "compact before the next turn" semantics.
      const compaction = await this.maybeCompact(messages, true)
      if (compaction) {
        messages.splice(0, messages.length, ...compaction.messages)
        const persistNote = this.deps.persistCompactionNote ?? appendCompactionNote
        await persistNote(
          compactionNotesPath(this.config.cwd, this.config.sessionId),
          renderCompactionNote(this.now(), compaction),
        )
        yield* this.emit({
          kind: 'compacted',
          droppedMessageCount: compaction.droppedCount,
          tokensSaved: compaction.tokensSaved,
          summary: compaction.summary,
        })
      }
    }

    messages.push({ role: 'user', content: input.userMessage })

    // Trace-only record of the run's input: consumers render the user message
    // themselves, so it is appended to the trace without entering the event
    // stream — reconstruction needs it, UIs must not see it twice.
    await this.trace.sink.append({ kind: 'user_message', content: input.userMessage })

    while (true) {
      if (this.deps.signal?.aborted) {
        yield* this.emit({
          kind: 'done',
          reason: 'aborted',
          steps: budget.currentSteps,
          usage: budget.currentUsage,
        })
        return
      }

      const pre = budget.snapshot()
      if (pre.exhausted) {
        yield* this.emit({
          kind: 'done',
          reason: exhaustionReason(pre.exhaustedBy),
          steps: pre.steps,
          usage: pre.usage,
        })
        return
      }

      const compaction = await this.maybeCompact(messages)
      if (compaction) {
        messages.splice(0, messages.length, ...compaction.messages)
        // Durable artifact: the summary the model will act on also lands on
        // disk, so dropped history stays auditable after the run.
        const persistNote = this.deps.persistCompactionNote ?? appendCompactionNote
        await persistNote(
          compactionNotesPath(this.config.cwd, this.config.sessionId),
          renderCompactionNote(this.now(), compaction),
        )
        yield* this.emit({
          kind: 'compacted',
          droppedMessageCount: compaction.droppedCount,
          tokensSaved: compaction.tokensSaved,
          summary: compaction.summary,
        })
      }

      budget.tickStep()
      const stepSpanId = this.newId()
      yield* this.emit({
        kind: 'span_start',
        spanId: stepSpanId,
        name: 'step',
        startedAt: this.now(),
        attributes: { step: budget.currentSteps },
      })

      const request: ProviderRequest = {
        systemStatic: systemPrompt.static,
        systemDynamic: systemPrompt.dynamic,
        messages,
        tools: tools.list(),
        model: this.config.model,
        maxOutputTokens: this.config.maxOutputTokens,
        effort: this.config.effort,
        thinkingTokenBudget: this.config.thinkingTokenBudget,
        signal: this.deps.signal,
      }

      const modelSpanId = this.newId()
      yield* this.emit({
        kind: 'span_start',
        spanId: modelSpanId,
        parentSpanId: stepSpanId,
        name: 'model_call',
        startedAt: this.now(),
        attributes: { model: this.config.model },
      })
      const turn = await this.runTurn(provider.stream(request), budget)
      for (const ev of turn.events) yield* this.emit(ev)
      yield* this.emit({
        kind: 'span_end',
        spanId: modelSpanId,
        endedAt: this.now(),
        status: turn.error ? 'error' : 'ok',
        attributes: { stop_reason: turn.stopReason, tool_calls: turn.toolCalls.length },
      })

      if (this.deps.signal?.aborted) {
        yield* this.emit({
          kind: 'span_end',
          spanId: stepSpanId,
          endedAt: this.now(),
          status: 'error',
        })
        yield* this.emit({
          kind: 'done',
          reason: 'aborted',
          steps: budget.currentSteps,
          usage: budget.currentUsage,
        })
        return
      }

      const warning = budget.consumeCostWarning()
      if (warning) {
        yield* this.emit({
          kind: 'cost_warning',
          costUsd: warning.costUsd,
          thresholdUsd: warning.thresholdUsd,
          limitUsd: this.config.budget.maxCostUsd,
        })
      }

      if (turn.error) {
        yield* this.emit({
          kind: 'span_end',
          spanId: stepSpanId,
          endedAt: this.now(),
          status: 'error',
        })
        yield* this.emit({
          kind: 'done',
          reason: 'error',
          steps: budget.currentSteps,
          usage: budget.currentUsage,
        })
        return
      }

      if (turn.text.length > 0 || turn.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: turn.text,
          toolCalls: turn.toolCalls.length > 0 ? turn.toolCalls : undefined,
          thinking: turn.thinking.length > 0 ? turn.thinking : undefined,
        })
      }

      if (turn.toolCalls.length === 0 || turn.stopReason === 'end_turn') {
        yield* this.emit({
          kind: 'span_end',
          spanId: stepSpanId,
          endedAt: this.now(),
          status: 'ok',
        })
        const post = budget.snapshot()
        if (post.exhausted) {
          yield* this.emit({
            kind: 'done',
            reason: exhaustionReason(post.exhaustedBy),
            steps: budget.currentSteps,
            usage: budget.currentUsage,
          })
          return
        }
        yield* this.emit({
          kind: 'done',
          reason: 'stop',
          steps: budget.currentSteps,
          usage: budget.currentUsage,
        })
        return
      }

      for (let callIndex = 0; callIndex < turn.toolCalls.length; callIndex++) {
        const call = turn.toolCalls[callIndex]!
        const check = loopDetector.record(call)
        if (check.looping) {
          // Break the loop: seal history with error results for this and any
          // remaining calls (a dangling tool_use without a tool result would
          // fail the next provider request), then end the run.
          for (const skipped of turn.toolCalls.slice(callIndex)) {
            const content = `loop detected: ${skipped.name} not executed — this call's signature repeated ${check.count}x recently; run stopped`
            messages.push({ role: 'tool', content, toolCallId: skipped.id })
            yield* this.emit({ kind: 'tool_result', result: { id: skipped.id, content, isError: true } })
          }
          yield* this.emit({
            kind: 'loop_detected',
            toolName: call.name,
            signature: check.signature,
            count: check.count,
          })
          yield* this.emit({
            kind: 'span_end',
            spanId: stepSpanId,
            endedAt: this.now(),
            status: 'error',
            attributes: { loop_signature: check.signature, tool: call.name },
          })
          yield* this.emit({
            kind: 'done',
            reason: 'loop_detected',
            steps: budget.currentSteps,
            usage: budget.currentUsage,
          })
          return
        }
        const toolSpanId = this.newId()
        yield* this.emit({
          kind: 'span_start',
          spanId: toolSpanId,
          parentSpanId: stepSpanId,
          name: 'tool_call',
          startedAt: this.now(),
          attributes: { tool: call.name, tool_call_id: call.id },
        })
        const { payload: result, permission } = await this.runTool(call, budget)
        if (permission) yield* this.emit(permission)
        // Trim only the provider-bound copy; the full result still goes to the
        // display + session log below, so the budget is transport-only. The
        // recovery path is computed up front (cheap, deterministic) but only
        // written to disk if the content actually ends up trimmed.
        const recoveryPath = toolResultPath(this.config.cwd, this.config.sessionId, call.id)
        const budgeted = budgetToolOutput(result.content, this.config.toolOutputBudgetChars ?? 0, recoveryPath)
        messages.push({
          role: 'tool',
          content: budgeted.content,
          toolCallId: call.id,
        })
        // Keep only the newest browser snapshot live: a fresh snapshot supersedes
        // every earlier one down to a stub, so a long browser session holds one
        // a11y tree in context, not one per observation (MVP exit #3).
        if (budgeted.content.startsWith(SNAPSHOT_CONTENT_MARKER)) supersedeSnapshots(messages)
        if (budgeted.trimmed) {
          const persist = this.deps.persistToolOutput ?? persistOriginalToolOutput
          await persist(recoveryPath, result.content)
          yield* this.emit({
            kind: 'tool_output_budgeted',
            toolCallId: call.id,
            originalChars: budgeted.originalChars,
            keptChars: budgeted.keptChars,
            droppedChars: budgeted.originalChars - budgeted.keptChars,
          })
        }
        yield* this.emit({ kind: 'tool_result', result })
        const endAttrs: Record<string, SpanAttributeValue> = { tool: call.name, tool_call_id: call.id }
        const end: RuntimeEvent = {
          kind: 'span_end',
          spanId: toolSpanId,
          endedAt: this.now(),
          status: result.isError ? 'error' : 'ok',
          attributes: endAttrs,
        }
        if (result.isError) {
          end.error = result.content
        }
        yield* this.emit(end)
      }

      yield* this.emit({
        kind: 'span_end',
        spanId: stepSpanId,
        endedAt: this.now(),
        status: 'ok',
      })
    }
  }

  private now(): string {
    return this.deps.clock ? this.deps.clock() : new Date().toISOString()
  }

  private newId(): string {
    return this.deps.idGen ? this.deps.idGen() : randomUUID()
  }

  private async runTurn(stream: AsyncIterable<ProviderStreamEvent>, budget: RuntimeBudget): Promise<TurnResult> {
    const events: RuntimeEvent[] = []
    let text = ''
    const toolCalls: ToolCall[] = []
    const thinking: ThinkingBlock[] = []
    let currentThinking = ''
    let usage: UsageTotals = emptyUsage()
    let stopReason: ProviderStreamEvent extends { kind: 'finish' }
      ? never
      : 'end_turn' | 'tool_use' | 'max_tokens' | 'error' = 'end_turn'
    let error = false

    try {
      for await (const ev of stream) {
        if (ev.kind === 'text-delta') {
          text += ev.delta
          events.push({ kind: 'text', delta: ev.delta })
        } else if (ev.kind === 'thinking-delta') {
          currentThinking += ev.delta
          events.push({ kind: 'reasoning', delta: ev.delta })
        } else if (ev.kind === 'thinking-signature') {
          // The signature closes the current thinking block; both must be
          // replayed verbatim on the next request of a tool-use continuation.
          thinking.push({ thinking: currentThinking, signature: ev.signature })
          currentThinking = ''
        } else if (ev.kind === 'tool-use') {
          toolCalls.push(ev.call)
          events.push({ kind: 'tool_use', call: ev.call })
        } else if (ev.kind === 'tool-args-delta') {
          events.push({
            kind: 'tool_args_delta',
            toolUseId: ev.toolUseId,
            toolName: ev.toolName,
            partialJson: ev.partialJson,
          })
        } else if (ev.kind === 'usage') {
          usage = addUsage(usage, ev.usage)
        } else if (ev.kind === 'finish') {
          stopReason = ev.stopReason
          if (ev.stopReason === 'error') error = true
        }
      }
    } catch (err) {
      error = true
      if (!this.deps.signal?.aborted) {
        this.deps.quirks?.record(this.config.model, 'provider_error')
        events.push({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
          retryable: false,
        })
      }
    }

    if (currentThinking) {
      thinking.push({ thinking: currentThinking })
    }

    budget.addUsage(usage)
    events.push({
      kind: 'usage',
      step: budget.currentSteps,
      turn: usage,
      cumulative: budget.currentUsage,
    })
    return { events, text, toolCalls, thinking, stopReason, error }
  }

  private async runTool(
    call: ToolCall,
    budget: RuntimeBudget,
  ): Promise<{ payload: ToolResultPayload; permission?: PermissionDecisionEvent }> {
    const ctx: ToolContext = {
      sessionId: this.config.sessionId,
      cwd: this.config.cwd,
      workspaceRoots: this.deps.workspaceRoots,
      model: this.config.model,
      sharedState: this.deps.sharedState,
      askUser: this.deps.askUser,
      provider: this.deps.provider,
      tools: this.deps.tools,
      permissionMode: this.deps.permissionMode,
      spinePrompt: this.deps.spinePrompt,
      budget,
      subagentDepth: this.deps.subagentDepth,
      quirks: this.deps.quirks,
      providerName: this.config.providerName,
      harnessVersion: this.config.harnessVersion,
      traceSink: this.deps.traceSink,
    }

    if (this.deps.sharedState?.planMode && !PLAN_MODE_ALLOWED_TOOLS.has(call.name)) {
      return {
        payload: {
          id: call.id,
          content: `plan mode active: tool "${call.name}" is blocked. Call exit_plan_mode to resume execution.`,
          isError: true,
        },
      }
    }

    const inputJson = JSON.stringify(call.input)

    let preHook: Awaited<ReturnType<HookRunner['runPreToolUse']>> | undefined
    if (this.deps.hookRunner) {
      preHook = await this.deps.hookRunner.runPreToolUse(call.name, inputJson)
    }

    let permission: PermissionDecisionEvent | undefined
    if (this.deps.enforcer && this.deps.enforcerAskUser && this.deps.permissionMode) {
      const hookReason = preHook?.permissionReason ?? (preHook?.messages.join('; ') || undefined)
      const hookOverride = preHook?.permissionOverride
        ? {
            decision: preHook.permissionOverride,
            reason: hookReason,
          }
        : preHook?.denied
          ? {
              decision: 'deny' as const,
              reason: hookReason ?? 'denied by pre-tool hook',
            }
          : undefined
      const decision = await this.deps.enforcer.enforce(call, {
        mode: this.deps.permissionMode,
        askUser: this.deps.enforcerAskUser,
        store: this.deps.enforcerStore,
        notifyDeny: this.deps.enforcerNotifyDeny,
        policy: this.deps.enforcerPolicy,
        notifyPolicy: this.deps.enforcerNotifyPolicy,
        toolRequirements: this.deps.enforcerToolRequirements,
        hookOverride,
        workspaceRoot: this.config.cwd,
      })
      if (decision.kind === 'deny') {
        permission = {
          kind: 'permission_decision',
          tool: call.name,
          toolCallId: call.id,
          decision: 'deny',
          reason: decision.reason,
        }
        return {
          payload: { id: call.id, content: `permission denied: ${decision.reason}`, isError: true },
          permission,
        }
      }
      permission = { kind: 'permission_decision', tool: call.name, toolCallId: call.id, decision: 'allow' }
    }

    if (preHook?.denied) {
      return {
        payload: { id: call.id, content: `hook denied: ${preHook.messages.join('; ')}`, isError: true },
        permission,
      }
    }

    try {
      const r = await this.deps.tools.execute(call.name, call.input, ctx)

      if (this.deps.hookRunner) {
        await this.deps.hookRunner.runPostToolUse(call.name, inputJson, r.content, r.isError)
      }

      const payload: ToolResultPayload = { id: call.id, content: r.content, isError: r.isError }
      if (r.data !== undefined) payload.data = r.data
      if (r.artifacts !== undefined) payload.artifacts = r.artifacts
      if (r.evidence !== undefined) payload.evidence = r.evidence
      return { payload, permission }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      if (this.deps.hookRunner) {
        await this.deps.hookRunner.runPostToolUseFailure(call.name, inputJson, message)
      }

      return { payload: { id: call.id, content: message, isError: true }, permission }
    }
  }

  private async maybeCompact(messages: ChatMessage[], forced = false): Promise<CompactedOutput | null> {
    const { contextWindowTokens, compactionThreshold, keepRecentOnCompact } = this.config
    if (!forced) {
      const needs = shouldCompact(messages, contextWindowTokens, compactionThreshold, this.config.estimator)
      if (!needs) return null
    }
    const input = {
      messages,
      contextWindowTokens,
      thresholdRatio: compactionThreshold,
      keepRecent: keepRecentOnCompact,
      estimator: this.config.estimator,
    }
    // A queued explicit compaction preserves its deterministic, no-extra-call
    // behavior. Threshold compaction may use the injected bounded summarizer.
    const r =
      !forced && this.deps.compactionSummarizer
        ? await compactWithSummary(input, this.deps.compactionSummarizer)
        : compact(input)
    if (!r.compacted) return null
    return r
  }

  /**
   * Accumulates the manifest signals that only exist mid-stream: context
   * size per model call, model-call latency, compactions, file artifacts,
   * and sub-agent trace ids surfaced through agent-tool evidence.
   */
  private recordManifestSignals(trace: ActiveTrace, event: RuntimeEvent): void {
    if (event.kind === 'usage') {
      trace.contextSizeCurve.push(event.turn.inputTokens + event.turn.cacheReadTokens + event.turn.cacheCreationTokens)
    } else if (event.kind === 'span_start' && event.name === 'model_call') {
      trace.modelCallStarts.set(event.spanId, Date.parse(event.startedAt))
    } else if (event.kind === 'span_end' && trace.modelCallStarts.has(event.spanId)) {
      const started = trace.modelCallStarts.get(event.spanId)!
      trace.modelCallStarts.delete(event.spanId)
      const ended = Date.parse(event.endedAt)
      trace.modelCallLatenciesMs.push(
        Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, ended - started) : 0,
      )
    } else if (event.kind === 'compacted') {
      trace.compactions.push({ droppedMessageCount: event.droppedMessageCount, tokensSaved: event.tokensSaved })
    } else if (event.kind === 'tool_result') {
      for (const artifact of event.result.artifacts ?? []) {
        const seen = trace.filesChanged.some((a) => a.uri === artifact.uri && a.action === artifact.action)
        if (!seen) trace.filesChanged.push(artifact)
      }
      for (const item of event.result.evidence ?? []) {
        if (item.kind === 'subagent' && item.detail && typeof item.detail === 'object') {
          const childTraceId = (item.detail as Record<string, unknown>).traceId
          if (typeof childTraceId === 'string') trace.subAgentTraceIds.push(childTraceId)
        } else {
          this.recordBrowserSignal(trace, item)
        }
      }
    }
  }

  /**
   * Pulls M2 browser evidence out of a tool result into the manifest: navigation
   * targets, per-snapshot console/network deltas (and cumulative diagnostics on
   * failures, deduped by timestamp so a repeated cumulative dump is not
   * double-counted), screenshots, and exit-status test results.
   */
  private recordBrowserSignal(trace: ActiveTrace, item: { kind: string; detail?: unknown }): void {
    const detail = (item.detail ?? {}) as Record<string, unknown>
    if (item.kind === 'browser-navigation') {
      trace.browserActive = true
      trace.browserNavigations++
      if (typeof detail.url === 'string') trace.browserLastUrl = detail.url
    } else if (item.kind === 'browser-snapshot') {
      trace.browserActive = true
      if (typeof detail.url === 'string') trace.browserLastUrl = detail.url
      this.mergeConsole(trace, detail.newConsoleErrors)
      this.mergeNetwork(trace, detail.newFailedRequests)
    } else if (item.kind === 'browser-action') {
      trace.browserActive = true
    } else if (item.kind === 'browser-diagnostics') {
      trace.browserActive = true
      this.mergeConsole(trace, detail.consoleErrors)
      this.mergeNetwork(trace, detail.failedRequests)
    } else if (item.kind === 'browser-screenshot') {
      if (typeof detail.path === 'string' && !trace.screenshots.includes(detail.path)) {
        trace.screenshots.push(detail.path)
      }
    } else if (item.kind === 'exit-status') {
      if (typeof detail.command === 'string' && typeof detail.exitCode === 'number') {
        trace.testResults.push({ command: detail.command, exitCode: detail.exitCode, passed: detail.exitCode === 0 })
      }
    }
  }

  private mergeConsole(trace: ActiveTrace, raw: unknown): void {
    if (!Array.isArray(raw)) return
    for (const entry of raw as ConsoleErrorEntry[]) {
      const key = `${entry.at} ${entry.text}`
      if (trace.browserConsoleSeen.has(key)) continue
      trace.browserConsoleSeen.add(key)
      trace.browserConsoleErrors.push(entry)
    }
  }

  private mergeNetwork(trace: ActiveTrace, raw: unknown): void {
    if (!Array.isArray(raw)) return
    for (const entry of raw as FailedRequestEntry[]) {
      const key = `${entry.at} ${entry.method} ${entry.url} ${entry.status ?? ''}`
      if (trace.browserNetworkSeen.has(key)) continue
      trace.browserNetworkSeen.add(key)
      trace.browserNetworkFailures.push(entry)
    }
  }

  private async *emit(event: RuntimeEvent): AsyncIterable<RuntimeEvent> {
    if (this.trace) {
      if (event.kind === 'done') {
        const snapshot = { kind: 'transcript_snapshot' as const, messages: this.finalMessages }
        this.trace.eventCounts[snapshot.kind] = (this.trace.eventCounts[snapshot.kind] ?? 0) + 1
        await this.trace.sink.append(snapshot)
      }
      this.recordManifestSignals(this.trace, event)
      this.trace.eventCounts[event.kind] = (this.trace.eventCounts[event.kind] ?? 0) + 1
      await this.trace.sink.append(event)
      if (event.kind === 'done') {
        await this.trace.sink.finalize(this.buildManifest(this.trace, event.reason, event.steps, event.usage))
        this.trace = null
      }
    }
    if (this.deps.onEvent) await this.deps.onEvent(event)
    yield event
  }

  private buildManifest(trace: ActiveTrace, reason: DoneReason, steps: number, usage: UsageTotals): TraceManifest {
    const endedAt = this.now()
    const startedMs = Date.parse(trace.startedAt)
    const endedMs = Date.parse(endedAt)
    return {
      traceId: trace.traceId,
      sessionId: this.config.sessionId,
      task: trace.task,
      model: this.config.model,
      provider: this.config.providerName ?? null,
      harnessVersion: this.config.harnessVersion ?? null,
      systemPromptVersion: trace.systemPromptVersion,
      toolDefinitionsHash: trace.toolDefinitionsHash,
      startedAt: trace.startedAt,
      endedAt,
      latencyMs: Number.isFinite(startedMs) && Number.isFinite(endedMs) ? Math.max(0, endedMs - startedMs) : 0,
      doneReason: reason,
      steps,
      usage,
      billedTokens: billedTokens(usage),
      cachedTokens: cachedTokens(usage),
      estimatedCostUsd: estimatedCostUsd(usage, this.config.budget.model ?? this.config.model),
      contextSizeCurve: trace.contextSizeCurve,
      modelCallLatenciesMs: trace.modelCallLatenciesMs,
      retries: null,
      loopDetections: trace.eventCounts['loop_detected'] ?? 0,
      compactions: trace.compactions,
      subAgentTraceIds: trace.subAgentTraceIds,
      filesChanged: trace.filesChanged,
      quirks: this.deps.quirks?.snapshot() ?? {},
      eventCounts: trace.eventCounts,
      browserState: trace.browserActive
        ? { lastUrl: trace.browserLastUrl, navigations: trace.browserNavigations }
        : null,
      screenshots: trace.screenshots.length > 0 ? trace.screenshots : null,
      // `[]` is meaningful once the browser ran (clean console/network); null means it never ran.
      consoleErrors: trace.browserActive ? trace.browserConsoleErrors : null,
      networkFailures: trace.browserActive ? trace.browserNetworkFailures : null,
      testResults: trace.testResults.length > 0 ? trace.testResults : null,
      gateDecisions: null,
      graderResult: null,
      failureCategory: reason === 'stop' ? null : reason,
    }
  }
}

interface TurnResult {
  events: RuntimeEvent[]
  text: string
  toolCalls: ToolCall[]
  thinking: ThinkingBlock[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'error'
  error: boolean
}

interface CompactedOutput {
  messages: ChatMessage[]
  summary: string
  tokensSaved: number
  droppedCount: number
}
