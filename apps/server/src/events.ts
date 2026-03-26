import { EventEmitter } from 'events'

export type IncidentEventType = 'incident:created' | 'incident:updated' | 'incident:status_changed' | 'incident:action'

export interface IncidentEvent {
  type: IncidentEventType
  incidentId: string
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
  }
}

export const incidentEvents = new IncidentEventBus()
