import { mkdir, appendFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { RuntimeEvent, UsageTotals, DoneReason, ToolCall } from './events'
import type { ChatMessage } from './provider'
import type { QuirkKind } from './quirks'

/**
 * Per-run trace: every RuntimeEvent appended as JSONL while the run streams,
 * plus a manifest written when the run finishes. The trace is the audit
 * surface — a run must be reconstructable from it alone (M1 exit criterion,
 * proven by {@link reconstructTranscript}), and the manifest is where honest
 * accounting (usage split, cost, quirk counters) becomes visible per task.
 */

export interface TraceManifest {
  traceId: string
  sessionId: string
  model: string
  startedAt: string
  endedAt: string
  doneReason: DoneReason
  steps: number
  usage: UsageTotals
  billedTokens: number
  cachedTokens: number
  estimatedCostUsd: number
  quirks: Record<string, Partial<Record<QuirkKind, number>>>
  eventCounts: Record<string, number>
}

export interface TraceSink {
  append(event: RuntimeEvent): void | Promise<void>
  finalize(manifest: TraceManifest): void | Promise<void>
}

/**
 * Trace layout per docs/architecture/12-TRACE-SYSTEM.md: one directory per
 * run under `.orchentra/traces/<run-id>/` holding `events.jsonl` (the full
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

  async append(event: RuntimeEvent): Promise<void> {
    const path = traceEventsPath(this.cwd, this.traceId)
    if (!this.dirReady) {
      await mkdir(dirname(path), { recursive: true })
      this.dirReady = true
    }
    await appendFile(path, `${JSON.stringify(event)}\n`, 'utf8')
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
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  }
}

/**
 * Rebuild the run's message transcript from its trace events alone — the
 * proof behind "a full run is reconstructable from its trace". Mirrors the
 * runtime's own transcript assembly: streamed text becomes the assistant
 * message, tool_use events its tool calls, tool_result events the tool
 * messages, and a compacted event replays the same splice the runtime made.
 */
export function reconstructTranscript(events: RuntimeEvent[]): ChatMessage[] {
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
