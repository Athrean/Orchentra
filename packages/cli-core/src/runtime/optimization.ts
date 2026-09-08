import { createHash } from 'node:crypto'
import type { RuntimeEvent } from './events'
import type { ProgramSchedulerSnapshot } from './program-scheduler'
import type { ProviderToolSchema } from './provider'

/**
 * What can break the provider-side cached prefix, in the order the wire
 * renders it. `tool_order` is separate from `tools` on purpose: the prefix is
 * matched as an ordered byte sequence, so re-ordering an unchanged tool set
 * breaks the cache exactly as hard as editing one, and only one of those two
 * is a bug worth chasing.
 */
export type PrefixChangeReason = 'system' | 'tools' | 'tool_order'

/**
 * Hashes of the parts of a request that ADR-0020 defines as the cacheable
 * prefix: the canonical tool-schema list followed by the static system
 * partition. Trusted dynamic state and conversation messages sit after the
 * boundary and are deliberately not hashed here.
 */
export interface PrefixShape {
  systemHash: string
  /** Order-insensitive: the tool set itself, sorted by name before hashing. */
  toolsHash: string
  /** Order-sensitive: the names in the order they reach the provider. */
  toolOrderHash: string
  systemChars: number
  toolSchemaChars: number
}

export interface PrefixChange {
  step: number
  reasons: PrefixChangeReason[]
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

export function capturePrefixShape(systemStatic: string, tools: readonly ProviderToolSchema[]): PrefixShape {
  const canonical = tools.map((t) => JSON.stringify([t.name, t.description, t.inputSchema]))
  const sorted = [...canonical].sort()
  const toolsJson = sorted.join('\n')
  return {
    systemHash: shortHash(systemStatic),
    toolsHash: shortHash(toolsJson),
    toolOrderHash: shortHash(tools.map((t) => t.name).join('\n')),
    systemChars: systemStatic.length,
    toolSchemaChars: toolsJson.length,
  }
}

/**
 * Attributes a broken prefix rather than merely detecting one. An unchanged
 * tool set in a new order reports `tool_order` alone, which is the difference
 * between "the registry is non-deterministic" and "a tool was edited".
 */
export function comparePrefixShape(prev: PrefixShape, cur: PrefixShape): PrefixChangeReason[] {
  const reasons: PrefixChangeReason[] = []
  if (prev.systemHash !== cur.systemHash) reasons.push('system')
  if (prev.toolsHash !== cur.toolsHash) reasons.push('tools')
  else if (prev.toolOrderHash !== cur.toolOrderHash) reasons.push('tool_order')
  return reasons
}

export interface OptimizationMetrics {
  /** 2 added `prefix`; a record at version 1 did not measure prefix stability. */
  schemaVersion: 2
  /** Child runtimes own separate observations; do not sum inclusive budgets here. */
  scope: 'root-provider-calls'
  stablePrefixHash: string
  cache: {
    inputTokens: number
    readTokens: number
    creationTokens: number
    unreportedInputTokens: number
    hitRate: number | null
  }
  /**
   * Prefix stability across the run's provider calls. `changes` is empty when
   * every call presented the same prefix; `calls` says how many calls were
   * actually observed, so an empty list cannot be mistaken for "not measured".
   */
  prefix: {
    calls: number
    systemChars: number
    toolSchemaChars: number
    changes: PrefixChange[]
  }
  invalidations: { forcedCompactions: number; thresholdCompactions: number; browserSnapshots: number }
  scheduler: ProgramSchedulerSnapshot | null
  speculation: { matched: number; discarded: number; failed: number; savedWaitMs: number; extraComputeMs: number }
}

/** Runtime-owned observations, independent of model-authored tool result data. */
export class OptimizationTracker {
  private inputTokens = 0
  private readTokens = 0
  private creationTokens = 0
  private unreportedInputTokens = 0
  private invalidations = { forcedCompactions: 0, thresholdCompactions: 0, browserSnapshots: 0 }
  private speculation = { matched: 0, discarded: 0, failed: 0, savedWaitMs: 0, extraComputeMs: 0 }
  private lastShape: PrefixShape | null = null
  private prefixCalls = 0
  private prefixChanges: PrefixChange[] = []

  constructor(private readonly stablePrefixHash: string) {}

  /**
   * Called once per provider call, at the boundary where the request is
   * assembled. The first call establishes the baseline and cannot be a change.
   */
  observePrefix(step: number, shape: PrefixShape): void {
    this.prefixCalls++
    const prev = this.lastShape
    this.lastShape = shape
    if (!prev) return
    const reasons = comparePrefixShape(prev, shape)
    if (reasons.length > 0) this.prefixChanges.push({ step, reasons })
  }

  observe(event: RuntimeEvent): void {
    if (event.kind === 'usage') {
      const input = event.turn.inputTokens + event.turn.cacheReadTokens + event.turn.cacheCreationTokens
      this.inputTokens += input
      this.readTokens += event.turn.cacheReadTokens
      this.creationTokens += event.turn.cacheCreationTokens
      if (event.cacheReadReported !== true) this.unreportedInputTokens += input
    } else if (event.kind === 'context_invalidated') {
      if (event.reason === 'forced_compaction') this.invalidations.forcedCompactions++
      else if (event.reason === 'threshold_compaction') this.invalidations.thresholdCompactions++
      else this.invalidations.browserSnapshots += event.messagesAffected
    } else if (event.kind === 'speculative_tool') {
      this.speculation[event.attempt.status]++
      this.speculation.savedWaitMs += event.attempt.savedWaitMs
      this.speculation.extraComputeMs += event.attempt.extraComputeMs
    }
  }

  snapshot(scheduler: ProgramSchedulerSnapshot | null): OptimizationMetrics {
    return {
      schemaVersion: 2,
      scope: 'root-provider-calls',
      stablePrefixHash: this.stablePrefixHash,
      cache: {
        inputTokens: this.inputTokens,
        readTokens: this.readTokens,
        creationTokens: this.creationTokens,
        unreportedInputTokens: this.unreportedInputTokens,
        hitRate: this.inputTokens > 0 && this.unreportedInputTokens === 0 ? this.readTokens / this.inputTokens : null,
      },
      prefix: {
        calls: this.prefixCalls,
        systemChars: this.lastShape?.systemChars ?? 0,
        toolSchemaChars: this.lastShape?.toolSchemaChars ?? 0,
        changes: [...this.prefixChanges],
      },
      invalidations: { ...this.invalidations },
      scheduler,
      speculation: { ...this.speculation },
    }
  }
}
