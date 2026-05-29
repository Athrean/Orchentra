import { convertToModelMessages, smoothStream, stepCountIs, streamText, type UIMessage } from 'ai'
import { createClient } from '../../../lib/supabase/server'
import { chatBodySchema } from '../../../lib/ai/chat-request'
import { effortToProviderOptions } from '../../../lib/ai/effort'
import { resolveChatModel } from '../../../lib/ai/provider'
import { buildSystemPrompt } from '../../../lib/ai/system'
import { createChatTools } from '../../../lib/ai/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }
  const parsed = chatBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'invalid request' }, { status: 400 })
  }

  const { messages, model, effort, adaptive, permissionMode, scope } = parsed.data

  const resolved = await resolveChatModel(user.id, model)
  if (!resolved.ok) {
    if (resolved.reason === 'no-key') {
      return Response.json({ error: 'no LLM key on file — set one in Settings > AI Providers' }, { status: 412 })
    }
    return Response.json({ error: 'failed to decrypt LLM key' }, { status: 500 })
  }

  const tools = createChatTools({ userId: user.id, scope, permissionMode })

  const result = streamText({
    model: resolved.model,
    system: buildSystemPrompt({ scope, permissionMode, toolNames: Object.keys(tools) }),
    messages: await convertToModelMessages(messages as UIMessage[]),
    tools,
    providerOptions: effortToProviderOptions(resolved.provider, effort, adaptive),
    stopWhen: stepCountIs(5),
    experimental_transform: smoothStream(),
    abortSignal: req.signal,
  })

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    messageMetadata: ({ part }) => {
      if (part.type === 'finish') {
        return { model: resolved.modelId, totalUsage: part.totalUsage }
      }
      return undefined
    },
    onError: (error) => (error instanceof Error ? error.message : 'chat failed'),
  })
}
