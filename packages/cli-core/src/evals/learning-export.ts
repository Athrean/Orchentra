import { createHash } from 'node:crypto'
import { runMigrations } from '../runtime/migrations'
import { readTraceEvents, readTraceManifest } from '../runtime/trajectory'
import { redactPersistedData, reconstructTranscript, type TraceEvent, type TraceManifest } from '../runtime/trace'
import type { ChatMessage } from '../runtime/provider'

export interface LearningRun {
  traceId: string
  parentTraceId: string | null
  /** Hash of the redacted, filtered manifest/events/transcript below, not private raw bytes. */
  contentHash: string
  manifest: TraceManifest
  events: TraceEvent[]
  transcript: ChatMessage[]
}

export interface LearningExport {
  format: 'orchentra-rlm-learning'
  schemaVersion: 1
  exportedAt: string
  rootTraceId: string
  datasetHash: string
  omissions: string[]
  runs: LearningRun[]
}

const MAX_EXPORT_BYTES = 64 * 1024 * 1024
const OMITTED = [
  'provider-reasoning',
  'image-payloads',
  'artifact-file-contents',
  'unobserved-context-contents',
  'system-prompt-text',
]

/** Explicit local action only. Never uploads data or reads referenced artifact files. */
export async function exportLearningTrajectory(
  cwd: string,
  rootTraceId: string,
  exportedAt = new Date().toISOString(),
): Promise<LearningExport> {
  const runs: LearningRun[] = []
  const seen = new Set<string>()
  let remaining = MAX_EXPORT_BYTES
  await visit(rootTraceId, null, 0)
  return {
    format: 'orchentra-rlm-learning',
    schemaVersion: 1,
    exportedAt,
    rootTraceId,
    datasetHash: digest(runs),
    omissions: [...OMITTED],
    runs,
  }

  async function visit(traceId: string, parentTraceId: string | null, depth: number): Promise<void> {
    if (seen.has(traceId) || seen.size >= 256 || depth > 32)
      throw new Error('learning export: cycle, duplicate parent, or trace limit exceeded')
    seen.add(traceId)
    const manifest = await readTraceManifest(cwd, traceId) // No manifest means unfinished: fail closed.
    const events = await readTraceEvents(cwd, traceId, { maxBytes: remaining, allowIncompleteTail: false })
    remaining -= Buffer.byteLength(JSON.stringify({ manifest, events }))
    if (remaining < 0) throw new Error('learning export exceeds 64 MiB read limit')
    if (!events.some((event) => event.kind === 'done' && event.reason === manifest.doneReason)) {
      throw new Error('learning export: sealed manifest has no matching done event')
    }
    const children = new Set(manifest.subAgentTraceIds ?? [])
    const jobs = new Map<string, Extract<TraceEvent, { kind: 'model_job' }>['job']>()
    const links = new Map<string, string>()
    for (const event of events) {
      if (event.kind === 'recursive_link') links.set(`${event.jobId}:${event.attempt}`, event.childTraceId)
      if (event.kind === 'model_job') jobs.set(`${event.job.jobId}:${event.job.attempt}`, event.job)
    }
    for (const [key, job] of Array.from(jobs)) {
      if (job.status === 'running') throw new Error(`learning export: unfinished model job ${key}`)
      if (job.callKind !== 'recursive') continue
      const childId = job.traceId ?? links.get(key)
      if (!childId) throw new Error(`learning export: missing recursive trace for ${key}`)
      children.add(childId)
    }
    for (const id of Array.from(links.values())) children.add(id)
    const binaries = new Set<string>()
    collectImagePayloads(events, binaries)
    const filtered = sanitize(
      {
        manifest,
        events: events.filter((event) => event.kind !== 'reasoning'),
        transcript: reconstructTranscript(events),
      },
      binaries,
    ) as Pick<LearningRun, 'manifest' | 'events' | 'transcript'>
    runs.push({ traceId, parentTraceId, contentHash: digest(filtered), ...filtered })
    for (const child of Array.from(children).sort()) await visit(child, traceId, depth + 1)
  }
}

/** Version + content-integrity validation; hashes are reproducibility aids, not signatures. */
export function parseLearningExport(value: unknown): LearningExport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid learning export')
  const parsed = runMigrations<LearningExport>(value as Record<string, unknown>, {
    current: 1,
    versionKey: 'schemaVersion',
  })
  if (
    parsed.format !== 'orchentra-rlm-learning' ||
    !Array.isArray(parsed.runs) ||
    parsed.runs.length < 1 ||
    parsed.runs.length > 256 ||
    parsed.runs[0]?.traceId !== parsed.rootTraceId
  )
    throw new Error('invalid learning export identity or runs')
  const seen = new Set<string>()
  for (const run of parsed.runs) {
    if (
      !run ||
      seen.has(run.traceId) ||
      !/^[A-Za-z0-9_-]{1,160}$/.test(run.traceId) ||
      run.manifest?.traceId !== run.traceId ||
      !Array.isArray(run.events) ||
      !Array.isArray(run.transcript)
    )
      throw new Error('invalid learning run')
    if (run.traceId === parsed.rootTraceId ? run.parentTraceId !== null : !seen.has(run.parentTraceId!))
      throw new Error('invalid learning parent ordering')
    if (digest({ manifest: run.manifest, events: run.events, transcript: run.transcript }) !== run.contentHash)
      throw new Error('learning run content hash mismatch')
    seen.add(run.traceId)
  }
  if (digest(parsed.runs) !== parsed.datasetHash) throw new Error('learning dataset hash mismatch')
  return parsed
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function collectImagePayloads(value: unknown, payloads: Set<string>): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) collectImagePayloads(item, payloads)
    return
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'images' && Array.isArray(entry)) {
      for (const image of entry) if (typeof image?.data === 'string' && image.data.length > 8) payloads.add(image.data)
    }
    collectImagePayloads(entry, payloads)
  }
}

function sanitize(value: unknown, binaries: Set<string>): unknown {
  if (typeof value === 'string') {
    let text = value
    for (const data of Array.from(binaries)) text = text.split(data).join('<IMAGE_OMITTED>')
    return redactPersistedData(text)
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item, binaries))
  if (value && typeof value === 'object') {
    return redactPersistedData(
      Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => key !== 'thinking' && key !== 'images')
          .map(([key, entry]) => [key, sanitize(entry, binaries)]),
      ),
    )
  }
  return value
}
