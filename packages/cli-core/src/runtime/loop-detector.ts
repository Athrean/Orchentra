import { createHash } from 'node:crypto'
import { normalizeFailureLog, redactSecrets } from '../memory/failure-signature'
import type { ToolCall } from './events'

export interface LoopDetectionConfig {
  /** Break the run when one signature repeats this many times inside the window. 0 disables. */
  repeatThreshold?: number
  /** How many recent tool calls the detector remembers. */
  windowSize?: number
}

export const DEFAULT_REPEAT_THRESHOLD = 6
export const DEFAULT_WINDOW_SIZE = 16

/**
 * Signature of a tool call: name + normalized input. Reuses the
 * failure-signature normalization so calls that differ only in counters,
 * offsets, timestamps, or path prefixes collapse to one signature — a stuck
 * agent rarely repeats itself verbatim.
 */
export function toolCallSignature(call: ToolCall): string {
  const input = normalizeFailureLog(redactSecrets(JSON.stringify(call.input) ?? 'null'))
  return createHash('sha256').update(`${call.name} ${input}`).digest('hex').slice(0, 16)
}

export interface LoopCheck {
  signature: string
  /** Occurrences of this signature within the window, including this call. */
  count: number
  looping: boolean
}

/**
 * Sliding-window repeat detector over normalized tool-call signatures. The
 * window (rather than a run-total count) keeps legitimate re-runs spread
 * across a long run — `git status` between edits, re-reading a file after a
 * change — from accumulating into a false positive.
 */
export class LoopDetector {
  private readonly window: string[] = []
  private readonly threshold: number
  private readonly windowSize: number

  constructor(config?: LoopDetectionConfig) {
    this.threshold = config?.repeatThreshold ?? DEFAULT_REPEAT_THRESHOLD
    this.windowSize = config?.windowSize ?? DEFAULT_WINDOW_SIZE
  }

  get enabled(): boolean {
    return this.threshold > 0
  }

  record(call: ToolCall): LoopCheck {
    const signature = toolCallSignature(call)
    if (!this.enabled) return { signature, count: 0, looping: false }
    this.window.push(signature)
    if (this.window.length > this.windowSize) this.window.shift()
    let count = 0
    for (const seen of this.window) {
      if (seen === signature) count++
    }
    return { signature, count, looping: count >= this.threshold }
  }
}
