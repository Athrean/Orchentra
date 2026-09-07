import { open } from 'node:fs/promises'
import type { UsageTotals } from './events'
import type { ModelJobSnapshot } from './model-functions'
import { estimatedCostUsd } from './usage'
import {
  parseTraceManifest,
  redactPersistedData,
  traceEventsPath,
  traceManifestPath,
  type TraceEvent,
  type TraceManifest,
} from './trace'

export interface TrajectoryNode {
  id: string
  kind: 'root' | 'leaf' | 'recursive'
  model: string
  status: string
  depth: number
  usage: UsageTotals | null
  /** Inclusive for recursive nodes; never add parents to child totals. */
  costUsd: number | null
  latencyMs: number | null
  traceId: string | null
  contextHandles: string[]
  evidenceCount: number
  artifacts: string[]
  permissionDenials: number
  gate: string | null
  children: TrajectoryNode[]
  warning?: string
}

export interface Trajectory {
  schemaVersion: 1
  root: TrajectoryNode
  complete: boolean
}

const MAX_TRACE_BYTES = 64 * 1024 * 1024

/** Read a bounded snapshot; concurrently appended bytes belong to the next refresh. */
async function readSnapshot(path: string, maxBytes: number): Promise<string> {
  const file = await open(path, 'r')
  try {
    const info = await file.stat()
    if (!info.isFile() || info.size > maxBytes) throw new Error('trace exceeds trajectory read limit or is not a file')
    const buffer = Buffer.alloc(info.size)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    return buffer.subarray(0, offset).toString('utf8')
  } finally {
    await file.close()
  }
}

export async function readTraceEvents(
  cwd: string,
  traceId: string,
  options: { maxBytes?: number; allowIncompleteTail?: boolean } = {},
): Promise<TraceEvent[]> {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(traceId)) throw new Error('invalid trace id')
  return parseTraceEvents(
    await readSnapshot(traceEventsPath(cwd, traceId), Math.min(options.maxBytes ?? MAX_TRACE_BYTES, MAX_TRACE_BYTES)),
    traceId,
    options.allowIncompleteTail,
  )
}

export async function readTraceManifest(cwd: string, traceId: string): Promise<TraceManifest> {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(traceId)) throw new Error('invalid trace id')
  const manifest = parseTraceManifest(JSON.parse(await readSnapshot(traceManifestPath(cwd, traceId), 1024 * 1024)))
  if (manifest.traceId !== traceId) throw new Error('manifest trace identity mismatch')
  return manifest
}

/** Legacy raw events migrate in memory; current records validate sequence/version. */
export function parseTraceEvents(text: string, expectedTraceId?: string, allowIncompleteTail = true): TraceEvent[] {
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  else {
    try {
      JSON.parse(lines[lines.length - 1]!)
    } catch (error) {
      if (!allowIncompleteTail) throw error
      lines.pop()
    } // A live writer may have appended only a partial last line.
  }
  return lines.map((line, index) => {
    const event = JSON.parse(line) as Record<string, unknown>
    if (!event || typeof event.kind !== 'string') throw new Error(`invalid trace event at line ${index + 1}`)
    if (event.traceVersion !== undefined) {
      if (event.traceVersion !== 2) throw new Error(`unsupported trace event version ${String(event.traceVersion)}`)
      if (event.sequence !== index + 1) throw new Error(`trace sequence mismatch at line ${index + 1}`)
      if (expectedTraceId && event.traceId !== expectedTraceId) throw new Error('trace identity mismatch')
    }
    return event as unknown as TraceEvent
  })
}

export async function loadTrajectory(cwd: string, traceId: string): Promise<Trajectory> {
  const seen = new Set<string>()
  let remainingBytes = MAX_TRACE_BYTES
  const root = await loadNode(traceId, 0)
  return { schemaVersion: 1, root, complete: root.status !== 'unfinished' && root.status !== 'unavailable' }

  async function loadNode(id: string, depth: number): Promise<TrajectoryNode> {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Error('invalid trace id')
    if (depth > 32 || seen.size >= 256 || seen.has(id)) throw new Error('recursive trace cycle or read limit exceeded')
    seen.add(id)
    const raw = await readSnapshot(traceEventsPath(cwd, id), remainingBytes)
    remainingBytes -= Buffer.byteLength(raw)
    let manifest: TraceManifest | null = null
    try {
      manifest = await readTraceManifest(cwd, id)
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error
    }
    const events = parseTraceEvents(raw, id, !manifest)
    if (manifest && manifest.traceId !== id) throw new Error('manifest trace identity mismatch')
    const node: TrajectoryNode = {
      id,
      kind: depth === 0 ? 'root' : 'recursive',
      model: manifest?.model ?? 'unknown',
      status: manifest?.doneReason ?? 'unfinished',
      depth,
      usage: manifest?.usage ?? null,
      costUsd: manifest?.estimatedCostUsd ?? null,
      latencyMs: manifest?.latencyMs ?? null,
      traceId: id,
      contextHandles: [],
      evidenceCount: 0,
      artifacts: [],
      permissionDenials: 0,
      gate: manifest?.gateDecisions?.[manifest.gateDecisions.length - 1]?.outcome ?? null,
      children: [],
    }
    const jobs = new Map<string, ModelJobSnapshot>()
    const links = new Map<string, string>()
    for (const event of events) {
      if (event.kind === 'run_identity') node.model = event.model
      else if (event.kind === 'usage' && !manifest) node.usage = event.cumulative
      else if (event.kind === 'model_job') jobs.set(`${event.job.jobId}:${event.job.attempt}`, event.job)
      else if (event.kind === 'recursive_link') links.set(`${event.jobId}:${event.attempt}`, event.childTraceId)
      else if (event.kind === 'context_access') node.contextHandles.push(event.handle)
      else if (event.kind === 'permission_decision' && event.decision === 'deny') node.permissionDenials++
      else if (event.kind === 'tool_result') {
        node.evidenceCount += event.result.evidence?.length ?? 0
        node.artifacts.push(...(event.result.artifacts ?? []).map((a) => a.uri))
      }
    }
    for (const [key, job] of Array.from(jobs)) {
      const childId = job.traceId ?? links.get(key)
      const elapsed = job.endedAt ? Date.parse(job.endedAt) - Date.parse(job.startedAt) : NaN
      let child: TrajectoryNode = {
        id: `${id}:${key}`,
        kind: job.callKind === 'leaf' ? 'leaf' : 'recursive',
        model: job.model,
        status: job.status,
        depth: depth + 1,
        usage: job.usage ?? null,
        costUsd: job.callKind === 'leaf' && job.usage ? (estimatedCostUsd(job.usage, job.model) ?? null) : null,
        latencyMs: Number.isFinite(elapsed) ? Math.max(0, elapsed) : null,
        traceId: childId ?? null,
        contextHandles: job.contextHandle ? [job.contextHandle] : [],
        evidenceCount: 0,
        artifacts: [],
        permissionDenials: 0,
        gate: null,
        children: [],
      }
      if (childId) {
        try {
          const loaded = await loadNode(childId, depth + 1)
          child = {
            ...loaded,
            id: child.id,
            kind: 'recursive',
            model: job.model,
            status: job.status,
            contextHandles: [...child.contextHandles, ...loaded.contextHandles],
          }
        } catch (error) {
          child.warning =
            (error as { code?: string }).code === 'ENOENT'
              ? 'child trace unavailable'
              : error instanceof Error
                ? error.message
                : String(error)
        }
      }
      node.children.push(child)
    }
    node.contextHandles = Array.from(new Set(node.contextHandles))
    node.artifacts = Array.from(new Set(node.artifacts))
    return node
  }
}

/** No collapsed branches: failures/cancellations stay visible in the same tree. */
export function renderTrajectory(tree: Trajectory): string {
  const lines = [
    'RLM trajectory (recursive usage/cost totals are inclusive; statuses are recorded, not process-liveness checks)',
  ]
  // eslint-disable-next-line no-control-regex -- strip terminal controls from trace text
  const clean = (text: string): string => String(redactPersistedData(text)).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
  function render(node: TrajectoryNode, prefix: string, last: boolean, root = false): void {
    const tokens = node.usage ? Object.values(node.usage).reduce((a, b) => a + b, 0) : 'unknown'
    lines.push(
      `${prefix}${root ? '' : last ? '└─ ' : '├─ '}${node.kind} ${clean(node.model)} [${clean(node.status)}] tokens=${tokens} cost=${node.costUsd === null ? 'unknown' : '$' + node.costUsd.toFixed(6)} ms=${node.latencyMs ?? 'unknown'} evidence=${node.evidenceCount} denied=${node.permissionDenials} gate=${clean(node.gate ?? 'none')} id=${clean(node.id)} trace=${clean(node.traceId ?? 'none')}${node.warning ? ' WARNING: ' + clean(node.warning) : ''}`,
    )
    const next = root ? '' : prefix + (last ? '   ' : '│  ')
    for (let i = 0; i < node.children.length; i++) render(node.children[i]!, next, i === node.children.length - 1)
  }
  render(tree.root, '', true, true)
  return lines.join('\n')
}
