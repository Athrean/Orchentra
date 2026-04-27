import { Hono } from 'hono'
import { z } from 'zod'
import { CommandRegistry } from '../commands/registry'
import { HelpCommand } from '../commands/builtin/help'
import { db, chatMessages } from '../db/client'
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

  const userInput = `/${resolved.handler.spec.name}${resolved.args.length > 0 ? ' ' + resolved.args.join(' ') : ''}`
  await db.insert(chatMessages).values({
    id: crypto.randomUUID(),
    orgId,
    sessionId: parsed.sessionId,
    role: 'user',
    content: userInput,
  })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const collected: string[] = []
      try {
        for await (const chunk of resolved.handler.execute(resolved.args, ctx)) {
          collected.push(chunk)
          controller.enqueue(encoder.encode(chunk))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const frame = `\n[error] ${msg}\n`
        collected.push(frame)
        controller.enqueue(encoder.encode(frame))
      } finally {
        controller.close()
        try {
          await db.insert(chatMessages).values({
            id: crypto.randomUUID(),
            orgId,
            sessionId: parsed.sessionId,
            role: 'assistant',
            content: collected.join(''),
          })
        } catch (err) {
          console.error('[commands] failed to persist assistant turn:', err)
        }
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
