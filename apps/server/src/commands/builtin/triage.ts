import type { CommandContext, CommandHandler, SlashCommandSpec } from '../registry'
import { findIncident, findIncidentByRunId } from '../../queries/incidents'
import { enqueueInvestigateJob } from '../../lib/incident-queue'
import { incidentEvents, type IncidentEvent } from '../../events'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REPO_RE = /^[\w.-]+\/[\w.-]+$/
const TERMINAL_STATUS = new Set(['resolved', 'dismissed'])
const STREAM_TIMEOUT_MS = 30_000

interface IncidentLike {
  id: string
  repo: string
  status: string
}

export class TriageCommand implements CommandHandler {
  readonly spec: SlashCommandSpec = {
    name: 'triage',
    aliases: [],
    summary: 'Manually trigger investigation for an incident or workflow run',
    argumentHint: '<incidentId> | <owner/repo> <runId>',
  }

  async *execute(args: string[], ctx: CommandContext): AsyncIterable<string> {
    const incident = await resolveTarget(args, ctx.orgId)
    if (incident instanceof Error) {
      yield `error: ${incident.message}\n`
      return
    }

    yield `Triaging ${incident.id} (${incident.repo})\n`

    await enqueueInvestigateJob(incident as Parameters<typeof enqueueInvestigateJob>[0])
    yield `queued.\n`

    yield* streamIncidentEvents(incident.id)
  }
}

async function* streamIncidentEvents(incidentId: string): AsyncIterable<string> {
  const queue: string[] = []
  let resolveNext: ((line: string | null) => void) | null = null
  let closed = false

  const finish = (): void => {
    if (closed) return
    closed = true
    incidentEvents.off('*', handler)
    if (resolveNext) {
      const r = resolveNext
      resolveNext = null
      r(null)
    }
  }

  const handler = (event: IncidentEvent): void => {
    if (event.incidentId !== incidentId) return
    const status = typeof event.data?.status === 'string' ? event.data.status : null
    const tool = typeof event.data?.tool === 'string' ? event.data.tool : null
    const detail = status ?? tool ?? ''
    const line = `[${event.type}]${detail ? ' ' + detail : ''}\n`

    if (resolveNext) {
      const r = resolveNext
      resolveNext = null
      r(line)
    } else {
      queue.push(line)
    }

    if (event.type === 'incident:status_changed' && status && TERMINAL_STATUS.has(status)) {
      finish()
    }
  }

  const timeout = setTimeout(finish, STREAM_TIMEOUT_MS)
  incidentEvents.on('*', handler)

  try {
    while (!closed || queue.length > 0) {
      const buffered = queue.shift()
      if (buffered !== undefined) {
        yield buffered
        continue
      }
      if (closed) break
      const next = await new Promise<string | null>((resolve) => {
        resolveNext = resolve
      })
      if (next === null) break
      yield next
    }
  } finally {
    clearTimeout(timeout)
    finish()
  }
}

async function resolveTarget(args: string[], orgId: string): Promise<IncidentLike | Error> {
  if (args.length === 0) {
    return new Error('expected <incidentId> or <owner/repo> <runId>')
  }

  const first = args[0]
  if (UUID_RE.test(first)) {
    const incident = await findIncident(first, orgId)
    if (!incident) return new Error(`incident ${first} not found`)
    return incident
  }

  if (REPO_RE.test(first)) {
    if (args.length < 2) return new Error('expected runId after <owner/repo>')
    const runId = Number(args[1])
    if (!Number.isFinite(runId) || runId <= 0) return new Error(`invalid runId: ${args[1]}`)
    const incident = await findIncidentByRunId(orgId, first.toLowerCase(), runId)
    if (!incident) {
      return new Error(`no incident found for ${first} run ${runId}; create-on-demand not yet implemented`)
    }
    return incident
  }

  return new Error(`unrecognized argument: ${first}`)
}
