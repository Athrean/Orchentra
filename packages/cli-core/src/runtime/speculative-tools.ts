import { performance } from 'node:perf_hooks'
import type { ToolResultPayload } from './events'
import { isSpeculativeSafe, type ToolSchedulingMetadata } from './tools'

export type SpeculativeToolStatus = 'matched' | 'discarded' | 'failed'

export interface SpeculativeToolAttemptRecord {
  readonly id: string
  readonly outerToolUseId: string
  readonly toolName: string
  readonly status: SpeculativeToolStatus
  readonly launchedAt: string
  readonly endedAt: string
  readonly durationMs: number
  readonly savedWaitMs: number
  readonly extraComputeMs: number
  readonly reason?: string
}

export interface SpeculativeExecution {
  readonly result: ToolResultPayload
  /** False when non-interactive permission preflight denied the launch result. */
  readonly reusable: boolean
}

export interface SpeculativeToolBrokerOptions {
  readonly enabled: boolean
  readonly scheduling: (toolName: string) => ToolSchedulingMetadata
  readonly execute: (toolName: string, input: unknown) => Promise<SpeculativeExecution>
  readonly onAttempt?: (attempt: SpeculativeToolAttemptRecord) => void | Promise<void>
  readonly now?: () => number
  readonly clock?: () => string
}

interface Candidate {
  readonly toolName: string
  readonly input: unknown
  readonly signature: string
}

interface Attempt {
  readonly id: string
  readonly outerToolUseId: string
  readonly candidate: Candidate
  readonly launchedAtMs: number
  readonly launchedAt: string
  readonly promise: Promise<AttemptOutcome>
  consumed: boolean
  finalization?: Promise<void>
}

type AttemptOutcome =
  | { readonly ok: true; readonly execution: SpeculativeExecution; readonly durationMs: number }
  | { readonly ok: false; readonly error: string; readonly durationMs: number }

export interface SpeculativeBinding {
  consume(toolName: string, input: unknown): Promise<ToolResultPayload | null>
  finish(): Promise<void>
}

/**
 * Conservative streaming-time speculation for one exact `rlm_execute` shape.
 * Ambiguous/incomplete code launches nothing; a final mismatch is discarded.
 */
export class SpeculativeToolBroker {
  private readonly partialArgs = new Map<string, string>()
  private readonly attempts = new Map<string, Attempt>()
  private sequence = 0
  private closed = false
  private activeExecutions = 0

  constructor(private readonly options: SpeculativeToolBrokerOptions) {}

  observe(outerToolUseId: string, outerToolName: string, partialJson: string): void {
    if (this.closed || !this.options.enabled || outerToolName !== 'rlm_execute' || this.attempts.has(outerToolUseId))
      return
    // Bound speculative work independently of the provider's output limits.
    if (this.sequence >= 256 || (this.partialArgs.size >= 256 && !this.partialArgs.has(outerToolUseId))) return
    const accumulated = (this.partialArgs.get(outerToolUseId) ?? '') + partialJson
    if (accumulated.length > 64_000) {
      this.partialArgs.set(outerToolUseId, 'invalid')
      return
    }
    this.partialArgs.set(outerToolUseId, accumulated)
    const candidate = parseSpeculativeProgramCall(accumulated)
    if (!candidate || !isSpeculativeSafe(this.options.scheduling(candidate.toolName))) return
    if (this.activeExecutions >= 4) return

    const launchedAtMs = this.now()
    this.activeExecutions++
    const promise = Promise.resolve()
      .then(() => this.options.execute(candidate.toolName, candidate.input))
      .then<AttemptOutcome, AttemptOutcome>(
        (execution) => ({ ok: true, execution, durationMs: Math.max(0, this.now() - launchedAtMs) }),
        (error: unknown) => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Math.max(0, this.now() - launchedAtMs),
        }),
      )
      .finally(() => {
        this.activeExecutions--
      })
    const attempt: Attempt = {
      id: `spec-tool-${++this.sequence}`,
      outerToolUseId,
      candidate,
      launchedAtMs,
      launchedAt: this.clock(),
      consumed: false,
      promise,
    }
    this.attempts.set(outerToolUseId, attempt)
  }

  bind(outerToolUseId: string, outerToolName: string, input: unknown): SpeculativeBinding | null {
    const attempt = this.attempts.get(outerToolUseId)
    if (!attempt || attempt.finalization) return null
    const finalCandidate =
      outerToolName === 'rlm_execute' && input && typeof input === 'object'
        ? parseSpeculativeCode((input as { code?: unknown }).code)
        : null
    if (!finalCandidate || finalCandidate.signature !== attempt.candidate.signature) {
      // close()/retainOnly() still await and propagate a sink failure.
      void this.finalize(attempt, 'discarded', 0, 'final_call_mismatch').catch(() => {})
      return null
    }

    return {
      consume: async (toolName, toolInput) => {
        if (attempt.consumed || signature(toolName, toolInput) !== attempt.candidate.signature) return null
        attempt.consumed = true
        const consumedAt = this.now()
        const outcome = await attempt.promise
        if (!outcome.ok) {
          await this.finalize(attempt, 'failed', 0, outcome.error)
          return null
        }
        if (!outcome.execution.reusable) {
          await this.finalize(attempt, 'discarded', 0, 'permission_preflight_denied')
          return null
        }
        const saved = Math.min(outcome.durationMs, Math.max(0, consumedAt - attempt.launchedAtMs))
        await this.finalize(attempt, 'matched', saved)
        return outcome.execution.result
      },
      finish: async () => {
        await this.finalize(attempt, 'discarded', 0, 'predicted_call_not_consumed')
      },
    }
  }

  /** Settle predictions before a preceding final tool call could mutate state. */
  async retainOnly(outerToolUseId?: string): Promise<void> {
    await Promise.all(
      Array.from(this.attempts.values(), (attempt) =>
        attempt.outerToolUseId === outerToolUseId
          ? Promise.resolve()
          : this.finalize(attempt, 'discarded', 0, 'not_first_final_call'),
      ),
    )
  }

  async close(): Promise<void> {
    this.closed = true
    await Promise.all(
      Array.from(this.attempts.values(), (attempt) => this.finalize(attempt, 'discarded', 0, 'parent_closed')),
    )
  }

  private finalize(
    attempt: Attempt,
    status: SpeculativeToolStatus,
    savedWaitMs: number,
    reason?: string,
  ): Promise<void> {
    // Share the actual completion promise: marking an attempt finalized before
    // its I/O settled allowed close() to seal the trace too early.
    attempt.finalization ??= this.recordFinalization(attempt, status, savedWaitMs, reason)
    return attempt.finalization
  }

  private async recordFinalization(
    attempt: Attempt,
    status: SpeculativeToolStatus,
    savedWaitMs: number,
    reason?: string,
  ): Promise<void> {
    const outcome = await attempt.promise
    const durationMs = outcome.durationMs
    await this.options.onAttempt?.({
      id: attempt.id,
      outerToolUseId: attempt.outerToolUseId,
      toolName: attempt.candidate.toolName,
      status,
      launchedAt: attempt.launchedAt,
      endedAt: this.clock(),
      durationMs,
      savedWaitMs,
      extraComputeMs: status === 'matched' ? 0 : durationMs,
      ...(reason ? { reason } : {}),
    })
  }

  private now(): number {
    return this.options.now?.() ?? performance.now()
  }

  private clock(): string {
    return this.options.clock?.() ?? new Date().toISOString()
  }
}

export function parseSpeculativeProgramCall(inputJson: string): Candidate | null {
  try {
    const input = JSON.parse(inputJson) as { code?: unknown }
    return parseSpeculativeCode(input.code)
  } catch {
    return null
  }
}

function parseSpeculativeCode(rawCode: unknown): Candidate | null {
  if (typeof rawCode !== 'string') return null
  const match = rawCode.match(
    /^\s*\(\s*async\s*\(\s*\)\s*=>\s*(?:await\s+)?tools\.call\(\s*("(?:\\.|[^"\\])*")\s*,\s*(\{[\s\S]*\})\s*\)\s*\)\s*\(\s*\)\s*;?\s*$/,
  )
  if (!match) return null
  try {
    const toolName = JSON.parse(match[1]!) as unknown
    const input = JSON.parse(match[2]!) as unknown
    if (typeof toolName !== 'string' || !input || typeof input !== 'object' || Array.isArray(input)) return null
    return { toolName, input, signature: signature(toolName, input) }
  } catch {
    return null
  }
}

function signature(toolName: string, input: unknown): string {
  return `${toolName}:${canonicalJson(input)}`
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
