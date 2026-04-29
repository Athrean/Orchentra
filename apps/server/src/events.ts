import { EventEmitter } from 'events'
import { broadcastToOrg as defaultBroadcast } from './ws'

export type IncidentEventType = 'incident:created' | 'incident:updated' | 'incident:status_changed' | 'incident:action'

export interface IncidentEvent {
  type: IncidentEventType
  incidentId: string
  orgId: string
  repo: string
  data?: Record<string, unknown>
}

type Broadcaster = (orgId: string, payload: unknown, repo?: string) => void

let broadcaster: Broadcaster = defaultBroadcast

/** Test-only seam: swap the WS broadcaster so events tests don't have to mock '../src/ws'. */
export function setBroadcasterForTesting(fn: Broadcaster | null): void {
  broadcaster = fn ?? defaultBroadcast
}

class IncidentEventBus extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(0) // SSE clients each add a listener — no cap needed
  }

  emitIncidentEvent(event: IncidentEvent): void {
    this.emit(event.type, event)
    this.emit('*', event) // wildcard for SSE streaming all events
    // Fan-out to all WebSocket clients in the same org
    broadcaster(event.orgId, event, event.repo)
  }
}

export const incidentEvents = new IncidentEventBus()
