import { Hono } from 'hono'
import { incidentEvents, type IncidentEvent } from '../events'
import type { AppVariables } from '../types'

export const streamRouter = new Hono<{ Variables: AppVariables }>()

streamRouter.get('/incidents/stream', async (c) => {
  const repo = c.req.query('repo')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller): void {
      const send = (data: string): void => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
      }

      const heartbeat = setInterval((): void => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`))
      }, 30_000)

      const listener = (event: IncidentEvent): void => {
        if (repo && event.repo !== repo) return
        send(JSON.stringify(event))
      }

      incidentEvents.on('*', listener)

      // Cleanup when client disconnects
      c.req.raw.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        incidentEvents.off('*', listener)
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})
