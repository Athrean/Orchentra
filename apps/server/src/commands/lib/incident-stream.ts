import { incidentEvents, type IncidentEvent } from '../../events'

const TERMINAL_STATUS = new Set(['resolved', 'dismissed'])
const STREAM_TIMEOUT_MS = 30_000

export async function* streamIncidentEvents(incidentId: string): AsyncIterable<string> {
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
