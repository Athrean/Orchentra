import type { AgentEvent } from '../agent/agent-events'

export type RenderStyle = 'pretty' | 'plain'

interface RenderOptions {
  style?: RenderStyle
}

interface Glyphs {
  phase: string
  call: string
  ok: string
  fail: string
}

const GLYPHS: Record<RenderStyle, Glyphs> = {
  pretty: { phase: '▸', call: '↳', ok: '✓', fail: '✗' },
  plain: { phase: '>', call: '->', ok: 'ok', fail: 'x' },
}

const ARG_SUMMARY_MAX = 80

function summarizeArgs(args: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(args)) {
    let valueStr: string
    if (value === null) valueStr = 'null'
    else if (typeof value === 'string') valueStr = value.length > 24 ? `${value.slice(0, 21)}…` : value
    else if (typeof value === 'number' || typeof value === 'boolean') valueStr = String(value)
    else valueStr = '…'
    parts.push(`${key}: ${valueStr}`)
  }
  const joined = parts.join(', ')
  if (joined.length <= ARG_SUMMARY_MAX) return joined
  return `${joined.slice(0, ARG_SUMMARY_MAX - 1)}…`
}

function firstLine(text: string): string {
  const trimmed = text.trim()
  const newline = trimmed.indexOf('\n')
  return newline === -1 ? trimmed : trimmed.slice(0, newline)
}

/**
 * Render a typed agent event into one or more human-readable frames.
 *
 * Each frame ends with `\n` so SSE consumers can flush per frame. Returns
 * an empty array if the event has no visible output.
 *
 * Same input → same output, no IO.
 */
export function renderAgentEventToFrames(event: AgentEvent, opts: RenderOptions = {}): string[] {
  const g = GLYPHS[opts.style ?? 'pretty']

  switch (event.kind) {
    case 'agent:started':
      return [`${g.phase} Investigating ${event.repo} · ${event.workflow}\n`]

    case 'agent:tool_call':
      return [`  ${g.call} ${event.tool}(${summarizeArgs(event.args)})\n`]

    case 'agent:tool_result': {
      const marker = event.isError ? g.fail : g.ok
      return [`  ${marker} ${event.tool} · ${event.durationMs} ms\n`]
    }

    case 'agent:synthesis':
      return [`${g.phase} Synthesizing brief…\n`]

    case 'agent:completed': {
      const pct = Math.round(event.confidence * 100)
      return [`${g.ok} ${event.failureType} · ${pct}% · ${firstLine(event.rootCause)}\n`]
    }

    case 'agent:error':
      return [`${g.fail} ${event.message}\n`]
  }
}

/** Convenience: render a sequence of events, concatenating their frames. */
export function renderAgentEventSequence(events: AgentEvent[], opts: RenderOptions = {}): string[] {
  const out: string[] = []
  for (const event of events) {
    for (const frame of renderAgentEventToFrames(event, opts)) {
      out.push(frame)
    }
  }
  return out
}
