import { Hono } from 'hono'
import { incidentEvents, type IncidentEvent } from '../events'
import type { AppVariables } from '../types'

export const streamRouter = new Hono<{ Variables: AppVariables }>()

streamRouter.get('/incidents/stream', async (c) => {
  const orgId = c.get('orgId')!
  const repo = c.req.query('repo')?.toLowerCase()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller): void {
      let closed = false

      const cleanup = (): void => {
        closed = true
        clearInterval(heartbeat)
        incidentEvents.off('*', listener)
      }

      const safeSend = (chunk: Uint8Array): void => {
        if (closed) return
        try {
          controller.enqueue(chunk)
        } catch {
          cleanup()
        }
      }

      const heartbeat = setInterval((): void => {
        safeSend(encoder.encode(`: heartbeat\n\n`))
      }, 30_000)

      const listener = (event: IncidentEvent): void => {
        if (event.orgId !== orgId) return
        if (repo && event.repo.toLowerCase() !== repo) return
        safeSend(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      incidentEvents.on('*', listener)

      c.req.raw.signal.addEventListener('abort', () => {
        cleanup()
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
