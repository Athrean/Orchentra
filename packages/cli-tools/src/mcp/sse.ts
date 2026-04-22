export interface SseEvent {
  readonly event: string | null
  readonly data: string
  readonly id: string | null
}

export class SseParser {
  private pending = ''
  private currentEvent: string | null = null
  private currentId: string | null = null
  private dataLines: string[] = []

  push(chunk: string): SseEvent[] {
    this.pending += chunk
    const events: SseEvent[] = []
    let idx = this.pending.indexOf('\n')
    while (idx !== -1) {
      const line = this.pending.slice(0, idx).replace(/\r$/, '')
      this.pending = this.pending.slice(idx + 1)
      const dispatched = this.processLine(line)
      if (dispatched) events.push(dispatched)
      idx = this.pending.indexOf('\n')
    }
    return events
  }

  private processLine(line: string): SseEvent | null {
    if (line.length === 0) {
      if (this.dataLines.length === 0 && this.currentEvent === null && this.currentId === null) {
        return null
      }
      const event: SseEvent = {
        event: this.currentEvent,
        data: this.dataLines.join('\n'),
        id: this.currentId,
      }
      this.currentEvent = null
      this.currentId = null
      this.dataLines = []
      return event
    }
    if (line.startsWith(':')) return null
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    switch (field) {
      case 'event':
        this.currentEvent = value
        break
      case 'data':
        this.dataLines.push(value)
        break
      case 'id':
        this.currentId = value
        break
      default:
        break
    }
    return null
  }
}
