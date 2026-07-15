import { mkdir, appendFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { RuntimeEvent, UsageTotals, DoneReason, ToolCall, ToolArtifact } from './events'
import type { ChatMessage } from './provider'
import type { QuirkKind } from './quirks'
import type { ConsoleErrorEntry, FailedRequestEntry } from './browser'
import type { GateDecisionRecord } from './run-state'
import { redactSecrets } from '../memory/failure-signature'

/** Browser session summary for the manifest — populated once browser ops run. */
export interface BrowserStateSummary {
  /** Last URL the run navigated to; null when nothing navigated. */
  lastUrl: string | null
  navigations: number
}

/** A command whose exit status the run recorded (test/typecheck/repro runs). */
export interface TestResultEntry {
  command: string
  exitCode: number
  passed: boolean
}

/**
 * Trace-only checkpoint of the exact provider-bound transcript at run end.
 *
 * Replaying streamed events is useful for older traces and live consumers,
 * but it cannot recover prior-turn context, signed thinking blocks, or the
 * trimmed copy of an oversized tool result exactly. This final checkpoint is
 * therefore the authoritative reconstruction record. It is written to the
 * trace only; it is not emitted to the UI or duplicated in the session log.
 */
export interface TranscriptSnapshotEvent {
  kind: 'transcript_snapshot'
  messages: ChatMessage[]
}

export type TraceEvent = RuntimeEvent | TranscriptSnapshotEvent

/**
 * Per-run trace: every runtime event plus trace-only checkpoints appended as JSONL while the run streams,
 * plus a manifest written when the run finishes. The trace is the audit
 * surface — a run must be reconstructable from it alone (M1 exit criterion,
 * proven by {@link reconstructTranscript}), and the manifest is where honest
 * accounting (usage split, cost, quirk counters) becomes visible per task.
 *
 * Fields the harness cannot produce yet are typed `null` — a stub is an
 * explicit "not yet", never fabricated data: browser fields land with M2,
 * gate decisions with M4, grader results with M3, and retries when the
 * provider clients start surfacing retry counts.
 */

export interface TraceManifest {
  traceId: string
  sessionId: string
  /** The user message that started the run. */
  task: string
  model: string
  /** Provider backend name; null when the host did not identify it. */
  provider: string | null
  /** Harness (CLI) version; null when the host did not supply it. */
  harnessVersion: string | null
  /** sha256 (first 12 hex chars) of the static system prompt. */
  systemPromptVersion: string
  /** sha256 (first 12 hex chars) of the advertised tool schemas JSON. */
  toolDefinitionsHash: string
  startedAt: string
  endedAt: string
  /** Wall-clock run duration; 0 when timestamps are not parseable. */
  latencyMs: number
  doneReason: DoneReason
  steps: number
  usage: UsageTotals
  billedTokens: number
  cachedTokens: number
  estimatedCostUsd: number
  /** Provider-visible context size (input + cache tokens) per model call. */
  contextSizeCurve: number[]
  modelCallLatenciesMs: number[]
  /** Classified retry counts — not instrumented yet. */
  retries: null
  loopDetections: number
  compactions: { droppedMessageCount: number; tokensSaved: number }[]
  /** Trace ids of sub-agent runs spawned by this run (their own trace dirs). */
  subAgentTraceIds: string[]
  /** File/directory artifacts reported by tool results, deduped. */
  filesChanged: ToolArtifact[]
  quirks: Record<string, Partial<Record<QuirkKind, number>>>
  eventCounts: Record<string, number>
  /**
   * M2 browser evidence. `null` means no browser op ran; once one does,
   * console/network carry `[]` (browser ran, clean) vs a populated list. Test
   * results are the exit-status commands the run executed.
   */
  browserState: BrowserStateSummary | null
  screenshots: string[] | null
  consoleErrors: ConsoleErrorEntry[] | null
  networkFailures: FailedRequestEntry[] | null
  testResults: TestResultEntry[] | null
  /** M4 completion decisions; null only for a non-verifiable run. */
  gateDecisions: readonly GateDecisionRecord[] | null
  /** M3 placeholder — no eval grader exists yet. */
  graderResult: null
  /** doneReason when the run did not end cleanly; null on 'stop'. */
  failureCategory: string | null
}

export interface TraceSink {
  append(event: TraceEvent): void | Promise<void>
  finalize(manifest: TraceManifest): void | Promise<void>
}

/**
 * One directory per run under `.orchentra/traces/<run-id>/` holds `events.jsonl` (the full
 * stream, append-only — traces escape the 256KB session rotation by design),
 * `manifest.json` (the run record), and `artifacts/` (screenshots, dumps,
 * diffs; populated from M2 on). The run id is the trace id.
 */
export function traceDir(cwd: string, traceId: string): string {
  return join(cwd, '.orchentra', 'traces', traceId)
}

export function traceEventsPath(cwd: string, traceId: string): string {
  return join(traceDir(cwd, traceId), 'events.jsonl')
}

export function traceManifestPath(cwd: string, traceId: string): string {
  return join(traceDir(cwd, traceId), 'manifest.json')
}

export function traceArtifactsDir(cwd: string, traceId: string): string {
  return join(traceDir(cwd, traceId), 'artifacts')
}

export class FileTraceSink implements TraceSink {
  private dirReady = false

  constructor(
    private readonly cwd: string,
    private readonly traceId: string,
  ) {}

  async append(event: TraceEvent): Promise<void> {
    const path = traceEventsPath(this.cwd, this.traceId)
    if (!this.dirReady) {
      await mkdir(dirname(path), { recursive: true })
      this.dirReady = true
    }
    await appendFile(path, `${JSON.stringify(redactTraceData(event))}\n`, 'utf8')
  }

  async finalize(manifest: TraceManifest): Promise<void> {
    const path = traceManifestPath(this.cwd, this.traceId)
    if (!this.dirReady) {
      await mkdir(dirname(path), { recursive: true })
      this.dirReady = true
    }
    // The artifacts directory is part of the documented layout even while
    // nothing writes into it yet — an empty dir means "no artifacts", which
    // is distinct from "layout not yet migrated".
    await mkdir(traceArtifactsDir(this.cwd, this.traceId), { recursive: true })
    await writeFile(path, `${JSON.stringify(redactTraceData(manifest), null, 2)}\n`, 'utf8')
  }
}

/** Redact strings and secret-shaped object fields immediately before disk I/O. */
function redactTraceData(value: unknown, key?: string): unknown {
  if (key && isSensitiveKey(key)) return '<REDACTED>'
  if (typeof value === 'string') return redactSecrets(value)
  if (Array.isArray(value)) return value.map((item) => redactTraceData(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        redactTraceData(entryValue, entryKey),
      ]),
    )
  }
  return value
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
  const parts = normalized.split(/[^a-z0-9]+/).filter(Boolean)
  const tail = parts[parts.length - 1]
  return (
    tail === 'key' ||
    tail === 'token' ||
    tail === 'secret' ||
    tail === 'password' ||
    tail === 'passwd' ||
    tail === 'pwd' ||
    tail === 'authorization' ||
    tail === 'cookie' ||
    tail === 'credential' ||
    tail === 'credentials'
  )
}

/**
 * Rebuild the run's message transcript from its trace events alone — the
 * proof behind "a full run is reconstructable from its trace". Mirrors the
 * runtime's own transcript assembly: streamed text becomes the assistant
 * message, tool_use events its tool calls, tool_result events the tool
 * messages, and a compacted event replays the same splice the runtime made.
 */
export function reconstructTranscript(events: readonly TraceEvent[]): ChatMessage[] {
  // New traces carry an exact terminal checkpoint. Prefer it over inferred
  // replay so prior context, thinking signatures, and provider-bound trimmed
  // tool content survive a cold reconstruction byte-for-byte.
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!
    if (event.kind === 'transcript_snapshot') return event.messages
  }

  const messages: ChatMessage[] = []
  let text = ''
  let toolCalls: ToolCall[] = []

  const flushAssistant = (): void => {
    if (text.length > 0 || toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      })
      text = ''
      toolCalls = []
    }
  }

  for (const ev of events) {
    if (ev.kind === 'user_message') {
      flushAssistant()
      messages.push({ role: 'user', content: ev.content })
    } else if (ev.kind === 'text') {
      text += ev.delta
    } else if (ev.kind === 'tool_use') {
      toolCalls.push(ev.call)
    } else if (ev.kind === 'tool_result') {
      flushAssistant()
      messages.push({ role: 'tool', content: ev.result.content, toolCallId: ev.result.id })
    } else if (ev.kind === 'compacted') {
      flushAssistant()
      messages.splice(0, ev.droppedMessageCount, {
        role: 'user',
        content: `[context-compacted] earlier turns summarized:\n${ev.summary}`,
      })
    }
  }
  flushAssistant()
  return messages
}
