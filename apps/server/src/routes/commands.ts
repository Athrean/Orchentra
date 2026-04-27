import { Hono } from 'hono'
import { z } from 'zod'
import { CommandRegistry } from '../commands/registry'
import { HelpCommand } from '../commands/builtin/help'
import type { AppVariables } from '../types'

const BodySchema = z.object({
  command: z.string().min(1).max(64),
  args: z.array(z.string()).optional(),
  sessionId: z.string().min(1).max(128),
})

export const commandsRouter = new Hono<{ Variables: AppVariables }>()

const registry = new CommandRegistry()
registry.register(new HelpCommand(registry))

commandsRouter.post('/commands', async (c) => {
  let parsed: z.infer<typeof BodySchema>
  try {
    parsed = BodySchema.parse(await c.req.json())
  } catch {
    return c.json({ error: 'invalid body' }, 400)
  }

  const orgId = c.get('orgId')!
  const userId = c.get('user')?.id ?? null

  const input = parsed.command.startsWith('/') ? parsed.command : `/${parsed.command}`
  const resolved = registry.resolve(input)
  if (!resolved) return c.json({ error: 'invalid command' }, 400)
  if (resolved instanceof Error) return c.json({ error: resolved.message }, 400)

  const ctx = { orgId, userId, sessionId: parsed.sessionId }
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        for await (const chunk of resolved.handler.execute(resolved.args, ctx)) {
          controller.enqueue(encoder.encode(chunk))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        controller.enqueue(encoder.encode(`\n[error] ${msg}\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    },
  })
})
