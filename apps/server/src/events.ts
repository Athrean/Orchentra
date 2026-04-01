import { EventEmitter } from 'events'
import { broadcastToOrg } from './ws'

export type IncidentEventType = 'incident:created' | 'incident:updated' | 'incident:status_changed' | 'incident:action'

export interface IncidentEvent {
  type: IncidentEventType
  incidentId: string
  orgId: string
  repo: string
  data?: Record<string, unknown>
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
    broadcastToOrg(event.orgId, event, event.repo)
  }
}

export const incidentEvents = new IncidentEventBus()
