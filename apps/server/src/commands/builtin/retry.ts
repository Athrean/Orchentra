import type { CommandContext, CommandHandler, SlashCommandSpec } from '../registry'
import { findIncident, resetIncidentForRetry } from '../../queries/incidents'
import { enqueueInvestigateJob } from '../../lib/job-queue'
import { streamIncidentEvents } from '../lib/incident-stream'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RETRYABLE_STATUS = new Set(['error', 'dismissed'])

export class RetryCommand implements CommandHandler {
  readonly spec: SlashCommandSpec = {
    name: 'retry',
    aliases: [],
    summary: 'Re-enqueue an errored or dismissed incident for re-investigation',
    argumentHint: '<incidentId>',
  }

  async *execute(args: string[], ctx: CommandContext): AsyncIterable<string> {
    if (args.length === 0 || !UUID_RE.test(args[0])) {
      yield `error: expected <incidentId> as a UUID\n`
      return
    }

    const incident = await findIncident(args[0], ctx.orgId)
    if (!incident) {
      yield `error: incident ${args[0]} not found\n`
      return
    }

    if (!RETRYABLE_STATUS.has(incident.status)) {
      yield `error: incident is in status '${incident.status}', not retryable (must be one of: ${Array.from(RETRYABLE_STATUS).join(', ')})\n`
      return
    }

    await resetIncidentForRetry(incident.id, ctx.orgId)
    yield `Retrying ${incident.id} (${incident.repo})\n`

    await enqueueInvestigateJob({ ...incident, status: 'investigating' })
    yield `queued.\n`

    yield* streamIncidentEvents(incident.id)
  }
}
