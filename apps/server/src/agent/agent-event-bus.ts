import type { AgentEvent } from './agent-events'
import { broadcastToOrg as defaultBroadcast } from '../ws'

type Broadcaster = (orgId: string, payload: unknown, repo?: string) => void

let broadcaster: Broadcaster = defaultBroadcast

/** Test-only seam: swap the WS broadcaster so tests don't have to mock '../ws'. */
export function setBroadcasterForTesting(fn: Broadcaster | null): void {
  broadcaster = fn ?? defaultBroadcast
}

export const REPLAY_MAX_EVENTS = 20
export const REPLAY_MAX_BYTES = 32 * 1024

export interface AgentEventEnvelope {
  incidentId: string
  orgId: string
  repo: string
  timestamp: number
  event: AgentEvent
}

interface IncidentBuffer {
  events: AgentEventEnvelope[]
  bytes: number
}

const buffers = new Map<string, IncidentBuffer>()

function envelopeBytes(envelope: AgentEventEnvelope): number {
  return Buffer.byteLength(JSON.stringify(envelope), 'utf8')
}

function pushBounded(buf: IncidentBuffer, envelope: AgentEventEnvelope): void {
  buf.events.push(envelope)
  buf.bytes += envelopeBytes(envelope)

  while (buf.events.length > REPLAY_MAX_EVENTS && buf.events.length > 0) {
    const dropped = buf.events.shift()!
    buf.bytes -= envelopeBytes(dropped)
  }
  while (buf.bytes > REPLAY_MAX_BYTES && buf.events.length > 1) {
    const dropped = buf.events.shift()!
    buf.bytes -= envelopeBytes(dropped)
  }
}

export interface EmitArgs {
  incidentId: string
  orgId: string
  repo: string
  event: AgentEvent
}

export function emitAgentEvent({ incidentId, orgId, repo, event }: EmitArgs): void {
  const envelope: AgentEventEnvelope = {
    incidentId,
    orgId,
    repo,
    timestamp: Date.now(),
    event,
  }

  let buf = buffers.get(incidentId)
  if (!buf) {
    buf = { events: [], bytes: 0 }
    buffers.set(incidentId, buf)
  }
  pushBounded(buf, envelope)

  broadcaster(orgId, { type: 'agent:event', incidentId, timestamp: envelope.timestamp, event }, repo)
}

export function getReplay(incidentId: string): AgentEventEnvelope[] {
  const buf = buffers.get(incidentId)
  return buf ? [...buf.events] : []
}

export function clearReplay(incidentId: string): void {
  buffers.delete(incidentId)
}
