import { eq } from 'drizzle-orm'
import { db } from '../../../lib/db/client'
import { profiles } from '../../../lib/db/schema'
import { createClient } from '../../../lib/supabase/server'
import { decryptSecret } from '../../../lib/crypto'
import { chatRequestSchema, streamFromProvider, type LlmProvider } from '../../../lib/llm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 })
  }
  const parsed = chatRequestSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? 'invalid request' }), {
      status: 400,
    })
  }

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1)
  if (!profile?.llmKeyEncrypted) {
    return new Response(JSON.stringify({ error: 'no LLM key on file — set one at /account' }), { status: 412 })
  }
  const provider = (profile.llmProvider ?? 'anthropic') as LlmProvider
  let apiKey: string
  try {
    apiKey = decryptSecret(profile.llmKeyEncrypted)
  } catch {
    return new Response(JSON.stringify({ error: 'failed to decrypt LLM key' }), { status: 500 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamFromProvider({
          provider,
          apiKey,
          messages: parsed.data.messages,
          model: parsed.data.model,
        })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
          if (chunk.type === 'done' || chunk.type === 'error') break
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'stream failed'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
