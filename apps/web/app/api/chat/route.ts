import { eq } from 'drizzle-orm'
import { db } from '../../../lib/db/client'
import { profiles } from '../../../lib/db/schema'
import { createClient } from '../../../lib/supabase/server'
import { decryptSecret } from '../../../lib/crypto'
import { chatRequestSchema, streamFromProvider, type LlmProvider } from '../../../lib/llm'
import { getProviderCredential } from '../../../lib/ai-providers/credential-store'

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

  const configuredCredential =
    (await getProviderCredential(user.id, 'anthropic')) ?? (await getProviderCredential(user.id, 'openai'))

  let provider = configuredCredential?.provider as LlmProvider | undefined
  let apiKey = configuredCredential?.apiKey

  const [profile] = !apiKey ? await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1) : [null]
  if (!apiKey && !profile?.llmKeyEncrypted) {
    return new Response(JSON.stringify({ error: 'no LLM key on file — set one in Settings > AI Providers' }), {
      status: 412,
    })
  }
  try {
    if (!apiKey && profile?.llmKeyEncrypted) {
      apiKey = decryptSecret(profile.llmKeyEncrypted)
      provider = (profile.llmProvider ?? 'anthropic') as LlmProvider
    }
  } catch {
    return new Response(JSON.stringify({ error: 'failed to decrypt LLM key' }), { status: 500 })
  }
  if (!apiKey || !provider) {
    return new Response(JSON.stringify({ error: 'no supported LLM key configured' }), { status: 412 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const model =
        parsed.data.model ??
        configuredCredential?.defaultModel ??
        (provider === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4o-mini')
      const inputTokens = estimateTokens(parsed.data.messages.map((message) => message.content).join('\n'))
      let output = ''

      const send = (chunk: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))

      try {
        send({ type: 'stage', stage: { id: 'provider', label: `Connect to ${provider}`, status: 'active' } })
        send({ type: 'reasoning', text: `Using ${provider} with ${model}.` })
        for await (const chunk of streamFromProvider({
          provider,
          apiKey,
          messages: parsed.data.messages,
          model,
        })) {
          if (chunk.type === 'token' && chunk.text) output += chunk.text
          if (chunk.type === 'done') {
            const outputTokens = estimateTokens(output)
            send({ type: 'stage', stage: { id: 'provider', label: `Connect to ${provider}`, status: 'done' } })
            send({
              type: 'usage',
              usage: {
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
                estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens),
                model,
              },
            })
          }
          send(chunk)
          if (chunk.type === 'done' || chunk.type === 'error') break
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'stream failed'
        send({ type: 'stage', stage: { id: 'provider', label: `Connect to ${provider}`, status: 'failed' } })
        send({ type: 'error', error: msg })
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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return Number(((inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15).toFixed(6))
}
