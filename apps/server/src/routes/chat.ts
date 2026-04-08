import { Hono } from 'hono'
import { streamText, type CoreMessage } from 'ai'
import { createModel } from '../agent/llm'
import { createChatTools } from '../agent/tools/chat-tools'
import { db, chatMessages } from '../db/client'
import { eq, and, asc, desc } from 'drizzle-orm'
import type { AppVariables } from '../types'

export const chatRouter = new Hono<{ Variables: AppVariables }>()

const CHAT_SYSTEM_PROMPT = `You are Orchentra's CI/CD assistant. You help engineering teams understand and manage their CI/CD pipelines using plain English.

You have access to real-time data through tools:
- list_incidents: Find recent failures, filter by repo or status
- get_incident: Get full details for a specific incident (root cause, suggested fix)
- search_incidents: Search by keyword (e.g. "find npm install errors", "show flaky tests")
- list_repos: Show all monitored repos

Guidelines:
- Be concise and actionable — lead with the key finding, not preamble
- Quote exact root causes and failed steps from incident data when available
- When listing incidents, include ID, repo, status, and triggeredAt
- Suggest next steps (rerun, create fix PR, escalate) when relevant
- If asked about something outside your toolset, say so clearly rather than guessing`

/**
 * POST /api/orgs/:orgId/chat
 *
 * Body: { sessionId: string, message: string }
 *
 * Streams an SSE response using the AI SDK text-stream format.
 * Persists both the user message and final assistant response to chat_messages.
 */
chatRouter.post('/chat', async (c) => {
  const orgId = c.get('orgId')!
  const userId = c.get('user')?.id ?? null

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { sessionId, message } = body as { sessionId?: string; message?: string }
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 128) {
    return c.json({ error: 'sessionId is required (max 128 chars)' }, 400)
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return c.json({ error: 'message is required' }, 400)
  }
  if (message.length > 4_000) {
    return c.json({ error: 'message too long (max 4000 chars)' }, 400)
  }

  // Load prior conversation turns — fetch newest 20 with DESC, then reverse to chronological order
  const priorRows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(and(eq(chatMessages.orgId, orgId), eq(chatMessages.sessionId, sessionId)))
    .orderBy(desc(chatMessages.createdAt))
    .limit(20)

  priorRows.reverse()

  const history: CoreMessage[] = priorRows.map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }))

  // Persist the user's message before streaming so it's durable even on abort
  await db.insert(chatMessages).values({
    id: crypto.randomUUID(),
    orgId,
    sessionId,
    role: 'user',
    content: message.trim(),
  })

  const tools = createChatTools(orgId)

  const result = streamText({
    model: createModel(),
    system: CHAT_SYSTEM_PROMPT,
    messages: [...history, { role: 'user', content: message.trim() }],
    tools,
    maxSteps: 4,
    onFinish: async ({ text }) => {
      if (!text) return
      try {
        await db.insert(chatMessages).values({
          id: crypto.randomUUID(),
          orgId,
          sessionId,
          role: 'assistant',
          content: text,
        })
      } catch (err) {
        console.error('[chat] failed to persist assistant message:', err)
      }
      void userId // acknowledged — no user-side attribution needed for now
    },
  })

  return result.toDataStreamResponse()
})

/**
 * GET /api/orgs/:orgId/chat/history?sessionId=...
 *
 * Returns the last 50 messages for a session so the UI can restore history on load.
 */
chatRouter.get('/chat/history', async (c) => {
  const orgId = c.get('orgId')!
  const sessionId = c.req.query('sessionId')
  if (!sessionId || sessionId.length > 128) return c.json({ error: 'sessionId is required (max 128 chars)' }, 400)

  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(and(eq(chatMessages.orgId, orgId), eq(chatMessages.sessionId, sessionId)))
    .orderBy(asc(chatMessages.createdAt))
    .limit(50)

  return c.json({ messages: rows })
})
