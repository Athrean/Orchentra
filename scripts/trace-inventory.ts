/**
 * Inventory of local run traces. Reads `.orchentra/traces/` only — no provider
 * calls, no credentials, no network.
 *
 * Answers the questions an optimization premise has to survive before code is
 * written: how many turns emitted more than one tool call, how much wall time
 * tool execution actually consumed, and whether compaction ever fired.
 *
 *   bun run scripts/trace-inventory.ts [tracesDir]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

interface TraceEvent {
  kind: string
  name?: string
  spanId?: string
  parentSpanId?: string
  startedAt?: string
  endedAt?: string
  attributes?: Record<string, unknown>
  content?: string
  cacheReadReported?: boolean
  usage?: { cacheReadTokens?: number }
}

interface RunSummary {
  id: string
  model: string
  steps: number
  toolCalls: number
  /** Tool calls per step span; index is the count, value is how many turns had it. */
  callsPerTurn: number[]
  toolMs: number
  runMs: number
}

function readEvents(file: string): TraceEvent[] {
  const out: TraceEvent[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.length === 0) continue
    try {
      out.push(JSON.parse(line) as TraceEvent)
    } catch {
      // A trailing partial write is expected while a run is live.
    }
  }
  return out
}

function summarize(id: string, events: TraceEvent[]): RunSummary {
  const toolSpans = new Map<string, { start: number; parent: string }>()
  const callsByStep = new Map<string, number>()
  const models = new Set<string>()
  let steps = 0
  let toolMs = 0

  for (const e of events) {
    if (e.kind !== 'span_start') continue
    if (e.name === 'step') steps++
    if (e.name === 'model_call' && typeof e.attributes?.['model'] === 'string') {
      models.add(e.attributes['model'] as string)
    }
    if (e.name === 'tool_call' && e.spanId) {
      const parent = e.parentSpanId ?? ''
      toolSpans.set(e.spanId, { start: Date.parse(e.startedAt ?? ''), parent })
      callsByStep.set(parent, (callsByStep.get(parent) ?? 0) + 1)
    }
  }
  for (const e of events) {
    if (e.kind !== 'span_end' || !e.spanId) continue
    const span = toolSpans.get(e.spanId)
    // A span with no end is a run that was cut off mid-call; it still counts as
    // a call, just not as measured wall time.
    if (span) toolMs += Date.parse(e.endedAt ?? '') - span.start
  }

  const callsPerTurn: number[] = []
  for (const n of callsByStep.values()) callsPerTurn[n] = (callsPerTurn[n] ?? 0) + 1

  const starts = events.filter((e) => e.kind === 'span_start').map((e) => Date.parse(e.startedAt ?? ''))
  const ends = events.filter((e) => e.kind === 'span_end').map((e) => Date.parse(e.endedAt ?? ''))
  const runMs = starts.length > 0 && ends.length > 0 ? Math.max(...ends) - Math.min(...starts) : 0

  return {
    id,
    model: [...models].join(',') || 'unknown',
    steps,
    toolCalls: toolSpans.size,
    callsPerTurn,
    toolMs,
    runMs,
  }
}

const dir = process.argv[2] ?? join(process.cwd(), '.orchentra', 'traces')
if (!existsSync(dir)) {
  console.error(`no traces directory at ${dir}`)
  process.exit(1)
}

const runs: RunSummary[] = []
let compactions = 0
let usageEvents = 0
let cacheReported = 0
let cacheReadNonZero = 0

for (const id of readdirSync(dir)) {
  const file = join(dir, id, 'events.jsonl')
  if (!existsSync(file)) continue
  const events = readEvents(file)
  for (const e of events) {
    if (e.kind === 'compacted') compactions++
    if (e.kind !== 'usage') continue
    usageEvents++
    if (e.cacheReadReported === true) cacheReported++
    if ((e.usage?.cacheReadTokens ?? 0) > 0) cacheReadNonZero++
  }
  runs.push(summarize(id, events))
}

const totals = runs.reduce(
  (acc, r) => {
    acc.steps += r.steps
    acc.toolCalls += r.toolCalls
    acc.toolMs += r.toolMs
    acc.runMs += r.runMs
    r.callsPerTurn.forEach((count, n) => (acc.callsPerTurn[n] = (acc.callsPerTurn[n] ?? 0) + count))
    return acc
  },
  { steps: 0, toolCalls: 0, toolMs: 0, runMs: 0, callsPerTurn: [] as number[] },
)

console.log(`traces dir:            ${dir}`)
console.log(`runs:                  ${runs.length}`)
console.log(`model turns (steps):   ${totals.steps}`)
console.log(`tool calls:            ${totals.toolCalls}`)
console.log(`runs with any tool:    ${runs.filter((r) => r.toolCalls > 0).length}`)
console.log(`compaction events:     ${compactions}`)
console.log(
  `usage events:          ${usageEvents} (cacheReadReported=true: ${cacheReported}, cacheReadTokens>0: ${cacheReadNonZero})`,
)
console.log('\ncalls-per-turn histogram (turns that called at least one tool):')
totals.callsPerTurn.forEach((count, n) => {
  if (count) console.log(`  ${n} call(s): ${count} turn(s)`)
})
const multi = totals.callsPerTurn.reduce((sum, count, n) => (n >= 2 ? sum + count : sum), 0)
console.log(`  multi-call turns: ${multi}`)

console.log('\nper-run tool wall share (runs that called a tool):')
for (const r of runs.filter((x) => x.toolCalls > 0).sort((a, b) => b.toolMs - a.toolMs)) {
  const share = r.runMs > 0 ? ((r.toolMs / r.runMs) * 100).toFixed(1) : 'n/a'
  console.log(
    `  ${r.id.slice(0, 8)}  calls=${String(r.toolCalls).padStart(2)}  tool=${(r.toolMs / 1000).toFixed(2)}s  run=${(r.runMs / 1000).toFixed(2)}s  share=${share}%  ${r.model}`,
  )
}
const share = totals.runMs > 0 ? ((totals.toolMs / totals.runMs) * 100).toFixed(1) : 'n/a'
console.log(
  `  TOTAL  tool=${(totals.toolMs / 1000).toFixed(2)}s  run=${(totals.runMs / 1000).toFixed(2)}s  share=${share}%`,
)
