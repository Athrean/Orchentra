import { RuntimeBudget, type BudgetConfig } from './budget'
import {
  addUsage,
  emptyUsage,
  type RuntimeEvent,
  type ToolCall,
  type ToolResultPayload,
  type UsageTotals,
} from './events'
import { compact, shouldCompact, type TokenEstimator } from './compaction'
import type { ChatMessage, Provider, ProviderRequest, ProviderStreamEvent } from './provider'
import type { SystemPrompt } from './system-prompt'
import type { ToolContext, ToolRegistry } from './tools'

export interface ConversationConfig {
  model: string
  maxOutputTokens: number
  contextWindowTokens: number
  compactionThreshold: number
  keepRecentOnCompact: number
  budget: BudgetConfig
  sessionId: string
  cwd: string
  estimator?: TokenEstimator
}

export interface ConversationDeps {
  provider: Provider
  tools: ToolRegistry
  systemPrompt: SystemPrompt
  onEvent?: (event: RuntimeEvent) => void | Promise<void>
  signal?: AbortSignal
}

export interface RunInput {
  userMessage: string
  priorMessages?: ChatMessage[]
}

export class ConversationRuntime {
  constructor(
    private readonly config: ConversationConfig,
    private readonly deps: ConversationDeps,
  ) {}

  run(input: RunInput): AsyncIterable<RuntimeEvent> {
    return this.loop(input)
  }

  private async *loop(input: RunInput): AsyncIterable<RuntimeEvent> {
    const budget = new RuntimeBudget(this.config.budget)
    const messages: ChatMessage[] = [...(input.priorMessages ?? []), { role: 'user', content: input.userMessage }]
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
          reason: pre.exhaustedBy === 'steps' ? 'max_steps' : 'budget_exhausted',
          steps: pre.steps,
          usage: pre.usage,
        })
        return
      }

      const compaction = this.maybeCompact(messages)
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
      const request: ProviderRequest = {
        systemStatic: systemPrompt.static,
        systemDynamic: systemPrompt.dynamic,
        messages,
        tools: tools.list(),
        model: this.config.model,
        maxOutputTokens: this.config.maxOutputTokens,
      }

      const turn = await this.runTurn(provider.stream(request), budget)
      for (const ev of turn.events) yield* this.emit(ev)

      if (turn.error) {
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
          kind: 'done',
          reason: 'stop',
          steps: budget.currentSteps,
          usage: budget.currentUsage,
        })
        return
      }

      for (const call of turn.toolCalls) {
        const result = await this.runTool(call)
        messages.push({
          role: 'tool',
          content: result.content,
          toolCallId: call.id,
        })
        yield* this.emit({ kind: 'tool_result', result })
      }
    }
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

  private async runTool(call: ToolCall): Promise<ToolResultPayload> {
    const ctx: ToolContext = {
      sessionId: this.config.sessionId,
      cwd: this.config.cwd,
    }
    try {
      const r = await this.deps.tools.execute(call.name, call.input, ctx)
      return { id: call.id, content: r.content, isError: r.isError }
    } catch (err) {
      return {
        id: call.id,
        content: err instanceof Error ? err.message : String(err),
        isError: true,
      }
    }
  }

  private maybeCompact(messages: ChatMessage[]): CompactedOutput | null {
    const { contextWindowTokens, compactionThreshold, keepRecentOnCompact } = this.config
    const needs = shouldCompact(messages, contextWindowTokens, compactionThreshold, this.config.estimator)
    if (!needs) return null
    const r = compact({
      messages,
      contextWindowTokens,
      thresholdRatio: compactionThreshold,
      keepRecent: keepRecentOnCompact,
      estimator: this.config.estimator,
    })
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
