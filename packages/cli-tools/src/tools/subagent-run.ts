import {
  type ChatMessage,
  type DoneReason,
  type GateDecisionRecord,
  type Provider,
  type RunState,
  type RuntimeEvent,
  type ToolContext,
  type UsageTotals,
  CompletionPolicy,
  ConversationRuntime,
  addUsage,
  buildSystemPrompt,
  emptyUsage,
  estimatedCostUsd,
} from '@orchentra/cli-core'
import { isRateLimitError } from '@orchentra/cli-api'
import type { SubagentRole } from './subagent-roles'

export const MAX_ITERATIONS_PER_SUBAGENT = 10
const SUBAGENT_MAX_OUTPUT_TOKENS = 4096

export interface SubagentRunOutcome {
  text: string
  isError: boolean
  rateLimited?: boolean
  doneReason?: DoneReason
  toolCalls?: number
  /** Trace id of the child run, linking its trace dir from the parent manifest. */
  traceId?: string
  /** Completion-gate decision when the child ran under a CompletionPolicy. */
  gate?: GateDecisionRecord
  /** This child's own provider spend (also fed into the parent budget live). */
  usage: UsageTotals
  /** Estimated dollar cost of `usage` at the child's model pricing. */
  costUsd: number
}

export interface SubagentRunOptions {
  completionPolicy?: CompletionPolicy
  /** Restored conversation for a resumed child; `prompt` becomes the continuation message. */
  priorMessages?: ChatMessage[]
  /** Restored durable state for a resumed child. */
  runState?: RunState
  resume?: boolean
  /** Hands out the live runtime before the run starts, e.g. for mid-run steering. */
  onRuntime?: (runtime: ConversationRuntime) => void
  /** Observes every runtime event, e.g. for transcript persistence. */
  onEvent?: (event: RuntimeEvent) => void
  /** External cancel: aborting it stops the run cleanly (doneReason 'aborted'). */
  signal?: AbortSignal
}

export async function runSubagent(
  prompt: string,
  model: string,
  ctx: ToolContext,
  role: SubagentRole,
  options: SubagentRunOptions = {},
): Promise<SubagentRunOutcome> {
  // The runtime reports stream failures as message strings, so wrap the
  // provider to keep the thrown error's type for rate-limit classification.
  let thrown: unknown
  const provider: Provider = {
    stream(request) {
      const source = ctx.provider!
      return (async function* () {
        try {
          yield* source.stream(request)
        } catch (err) {
          thrown = err
          throw err
        }
      })()
    },
  }

  let usage = emptyUsage()
  try {
    const abort = new AbortController()
    // Let an external caller (agent_control interrupt) cancel the run: link its
    // signal into the same controller the budget-exhaustion path already uses.
    if (options.signal) {
      if (options.signal.aborted) abort.abort()
      else options.signal.addEventListener('abort', () => abort.abort(), { once: true })
    }
    const runtime = new ConversationRuntime(
      {
        model,
        maxOutputTokens: SUBAGENT_MAX_OUTPUT_TOKENS,
        contextWindowTokens: 200_000,
        compactionThreshold: 0.8,
        keepRecentOnCompact: 6,
        budget: { maxSteps: MAX_ITERATIONS_PER_SUBAGENT, maxTokens: 200_000, model },
        sessionId: ctx.sessionId,
        cwd: ctx.cwd,
        providerName: ctx.providerName,
        harnessVersion: ctx.harnessVersion,
      },
      {
        provider,
        tools: ctx.tools!,
        systemPrompt: buildSystemPrompt({
          staticParts: [
            role.focus,
            ctx.spinePrompt ?? '',
            'Complete the delegated scope only. Do not push or perform destructive git operations.',
          ],
          dynamicParts: [],
        }),
        sharedState: ctx.sharedState,
        askUser: ctx.askUser,
        permissionMode: ctx.permissionMode,
        spinePrompt: ctx.spinePrompt,
        workspaceRoots: ctx.workspaceRoots,
        subagentDepth: ctx.subagentDepth,
        quirks: ctx.quirks,
        // Only when the host injected one (tests route sub-agents to a no-op
        // sink). Unset in production so each sub-agent builds its own on-disk
        // trace dir and lastTraceId links back into the parent manifest.
        ...(ctx.traceSink ? { traceSink: ctx.traceSink } : {}),
        signal: abort.signal,
      },
    )
    options.onRuntime?.(runtime)

    let buf = ''
    let resultText = ''
    let toolCallsDone = 0
    let doneReason: DoneReason = 'stop'
    let errorMessage = ''
    let gate: GateDecisionRecord | undefined

    for await (const ev of runtime.run({
      userMessage: prompt,
      completionPolicy: options.completionPolicy,
      priorMessages: options.priorMessages,
      runState: options.runState,
      resume: options.resume,
    })) {
      options.onEvent?.(ev)
      if (ev.kind === 'text') {
        buf += ev.delta
      } else if (ev.kind === 'tool_result') {
        toolCallsDone++
        buf = ''
      } else if (ev.kind === 'gate_decision') {
        gate = ev.decision
      } else if (ev.kind === 'usage') {
        // Children draw the parent's live budget: spend lands as it happens,
        // and an exhausted parent aborts the child mid-run. Skip the abort
        // when the turn already failed — aborting here would relabel a
        // provider error (e.g. a 429 the pool wants to classify) as 'aborted'.
        usage = addUsage(usage, ev.turn)
        ctx.budget?.addUsage(ev.turn)
        if (!errorMessage && ctx.budget?.snapshot().exhausted) abort.abort()
      } else if (ev.kind === 'error') {
        errorMessage = ev.message
      } else if (ev.kind === 'done') {
        doneReason = ev.reason
      }
    }
    if (buf) resultText = buf
    const traceId = runtime.lastTraceId ?? undefined
    const costUsd = estimatedCostUsd(usage, model)

    if (doneReason === 'error') {
      return {
        text: `agent error: ${errorMessage || 'provider stream failed'}`,
        isError: true,
        rateLimited: isRateLimitError(thrown),
        doneReason,
        toolCalls: toolCallsDone,
        traceId,
        usage,
        costUsd,
      }
    }
    if (doneReason === 'loop_detected') {
      return {
        text: resultText || `Sub-agent stopped: repeated tool-call loop detected after ${toolCallsDone} tool call(s).`,
        isError: true,
        doneReason,
        toolCalls: toolCallsDone,
        traceId,
        usage,
        costUsd,
      }
    }
    if (doneReason === 'aborted') {
      return {
        text: resultText || `Sub-agent stopped: parent budget exhausted after ${toolCallsDone} tool call(s).`,
        isError: false,
        doneReason,
        toolCalls: toolCallsDone,
        traceId,
        usage,
        costUsd,
      }
    }
    if (doneReason === 'gate_failed' || doneReason === 'quarantined') {
      return {
        text: resultText || `Sub-agent failed its completion gate: ${gate?.summary ?? doneReason}`,
        isError: true,
        doneReason,
        toolCalls: toolCallsDone,
        traceId,
        gate,
        usage,
        costUsd,
      }
    }
    return {
      text: resultText || `Sub-agent completed (${toolCallsDone} tool call(s)).`,
      isError: false,
      doneReason,
      toolCalls: toolCallsDone,
      traceId,
      gate,
      usage,
      costUsd,
    }
  } catch (e) {
    return {
      text: `agent error: ${(e as Error).message}`,
      isError: true,
      rateLimited: isRateLimitError(e),
      doneReason: 'error',
      toolCalls: 0,
      usage,
      costUsd: estimatedCostUsd(usage, model),
    }
  }
}
