import { randomUUID } from 'node:crypto'
import { RuntimeBudget, type BudgetConfig, type BudgetState } from './budget'
import {
  addUsage,
  emptyUsage,
  type DoneReason,
  type RuntimeEvent,
  type SpanAttributeValue,
  type ToolCall,
  type ToolResultPayload,
  type UsageTotals,
} from './events'
import { compact, compactWithSummary, shouldCompact, type LlmSummarizer, type TokenEstimator } from './compaction'
import { budgetToolOutput } from './tool-output-budget'
import { persistOriginalToolOutput, toolResultPath } from './tool-output-recovery'
import type { ChatMessage, Provider, ProviderRequest, ProviderStreamEvent } from './provider'
import type { EffortTier } from './provider'
import type { SystemPrompt } from './system-prompt'
import type { AskUserHandler, SharedToolState, ToolContext, ToolRegistry } from './tools'
import type { HookRunner } from './hooks'
import type { PermissionEnforcer } from './permission-enforcer'
import type { Enforcer } from '../permissions/enforcer'

function exhaustionReason(by: BudgetState['exhaustedBy']): DoneReason {
  if (by === 'steps') return 'max_steps'
  if (by === 'cost') return 'cost_exhausted'
  return 'budget_exhausted'
}

const PLAN_MODE_ALLOWED_TOOLS = new Set<string>([
  'exit_plan_mode',
  'enter_plan_mode',
  'todo_write',
  'task_list',
  'task_get',
])

export interface ConversationConfig {
  model: string
  maxOutputTokens: number
  contextWindowTokens: number
  compactionThreshold: number
  keepRecentOnCompact: number
  /** Max chars of a tool result sent to the provider; over this it's trimmed (head+tail). 0 disables. */
  toolOutputBudgetChars?: number
  budget: BudgetConfig
  sessionId: string
  cwd: string
  effort?: EffortTier
  thinkingTokenBudget?: number
  estimator?: TokenEstimator
}

export interface ConversationDeps {
  provider: Provider
  tools: ToolRegistry
  systemPrompt: SystemPrompt
  hookRunner?: HookRunner
  permissionEnforcer?: PermissionEnforcer
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
  onEvent?: (event: RuntimeEvent) => void | Promise<void>
  signal?: AbortSignal
  clock?: () => string
  idGen?: () => string
  sharedState?: SharedToolState
  askUser?: AskUserHandler
  workspaceRoots?: readonly string[]
}

export interface RunInput {
  userMessage: string
  priorMessages?: ChatMessage[]
}

export class ConversationRuntime {
  private finalMessages: ChatMessage[] = []

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

  private async *loop(input: RunInput): AsyncIterable<RuntimeEvent> {
    const budget = new RuntimeBudget(this.config.budget)
    const messages: ChatMessage[] = [...(input.priorMessages ?? []), { role: 'user', content: input.userMessage }]
    this.finalMessages = messages
    const { provider, tools, systemPrompt } = this.deps

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
      }

      const turn = await this.runTurn(provider.stream(request), budget)
      for (const ev of turn.events) yield* this.emit(ev)

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

      for (const call of turn.toolCalls) {
        const toolSpanId = this.newId()
        yield* this.emit({
          kind: 'span_start',
          spanId: toolSpanId,
          parentSpanId: stepSpanId,
          name: 'tool_call',
          startedAt: this.now(),
          attributes: { tool: call.name, tool_call_id: call.id },
        })
        const result = await this.runTool(call, budget)
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
      events.push({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
        retryable: false,
      })
    }

    budget.addUsage(usage)
    events.push({
      kind: 'usage',
      step: budget.currentSteps,
      turn: usage,
      cumulative: budget.currentUsage,
    })
    return { events, text, toolCalls, stopReason, error }
  }

  private async runTool(call: ToolCall, budget: RuntimeBudget): Promise<ToolResultPayload> {
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
    }

    if (this.deps.sharedState?.planMode && !PLAN_MODE_ALLOWED_TOOLS.has(call.name)) {
      return {
        id: call.id,
        content: `plan mode active: tool "${call.name}" is blocked. Call exit_plan_mode to resume execution.`,
        isError: true,
      }
    }

    const inputJson = JSON.stringify(call.input)

    let preHook: Awaited<ReturnType<HookRunner['runPreToolUse']>> | undefined
    if (this.deps.hookRunner) {
      preHook = await this.deps.hookRunner.runPreToolUse(call.name, inputJson)
    }

    if (this.deps.permissionEnforcer) {
      const enforcement = this.deps.permissionEnforcer.check(call.name, inputJson)
      if (enforcement.kind === 'denied') {
        return { id: call.id, content: `permission denied: ${enforcement.reason}`, isError: true }
      }
    }

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
        return { id: call.id, content: `permission denied: ${decision.reason}`, isError: true }
      }
    }

    if (preHook?.denied) {
      return { id: call.id, content: `hook denied: ${preHook.messages.join('; ')}`, isError: true }
    }

    try {
      const r = await this.deps.tools.execute(call.name, call.input, ctx)

      if (this.deps.hookRunner) {
        await this.deps.hookRunner.runPostToolUse(call.name, inputJson, r.content, r.isError)
      }

      return { id: call.id, content: r.content, isError: r.isError }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      if (this.deps.hookRunner) {
        await this.deps.hookRunner.runPostToolUseFailure(call.name, inputJson, message)
      }

      return { id: call.id, content: message, isError: true }
    }
  }

  private async maybeCompact(messages: ChatMessage[]): Promise<CompactedOutput | null> {
    const { contextWindowTokens, compactionThreshold, keepRecentOnCompact } = this.config
    const needs = shouldCompact(messages, contextWindowTokens, compactionThreshold, this.config.estimator)
    if (!needs) return null
    const input = {
      messages,
      contextWindowTokens,
      thresholdRatio: compactionThreshold,
      keepRecent: keepRecentOnCompact,
      estimator: this.config.estimator,
    }
    const r = this.deps.compactionSummarizer
      ? await compactWithSummary(input, this.deps.compactionSummarizer)
      : compact(input)
    if (!r.compacted) return null
    return r
  }

  private async *emit(event: RuntimeEvent): AsyncIterable<RuntimeEvent> {
    if (this.deps.onEvent) await this.deps.onEvent(event)
    yield event
  }
}

interface TurnResult {
  events: RuntimeEvent[]
  text: string
  toolCalls: ToolCall[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'error'
  error: boolean
}

interface CompactedOutput {
  messages: ChatMessage[]
  summary: string
  tokensSaved: number
  droppedCount: number
}
