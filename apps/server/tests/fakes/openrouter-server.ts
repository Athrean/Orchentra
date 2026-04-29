import { Hono } from 'hono'
import type { Server } from 'bun'
import type { Context } from 'hono'

export interface CapturedLlmRequest {
  body: ChatCompletionRequest
  headers: Record<string, string>
}

export interface ChatCompletionRequest {
  model: string
  messages: Array<{ role: string; content: unknown; tool_calls?: unknown }>
  tools?: Array<{ type: 'function'; function: { name: string; description?: string; parameters?: unknown } }>
  tool_choice?: unknown
  response_format?: unknown
  stream?: boolean
  [key: string]: unknown
}

export interface ToolCallResponse {
  id?: string
  name: string
  /** JSON-serializable args; will be stringified when written to the response. */
  args: unknown
}

/** Single canned response returned by the fake on /v1/chat/completions. */
export interface ChatCompletionResponse {
  /** Plain assistant text (when not returning tool calls). */
  text?: string
  /** Tool calls to return — finish_reason becomes 'tool_calls'. */
  toolCalls?: ToolCallResponse[]
  /** Override finish_reason explicitly. */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter'
  /** Override usage. */
  usage?: { prompt_tokens: number; completion_tokens: number }
  /** Force HTTP error. */
  httpStatus?: number
  httpBody?: unknown
}

export interface FakeOpenRouterScenario {
  /** Sequential responses — index N is returned on the Nth /chat/completions call. */
  responses?: ChatCompletionResponse[]
  /** Optional matcher: pick a response based on the request (e.g. inspect response_format / tools). */
  selectResponse?: (req: ChatCompletionRequest) => ChatCompletionResponse | null
  /** Override the embedding vector returned by /v1/embeddings (default: deterministic 1536-dim sin curve). */
  embedding?: number[]
  /** Per-input embedding override — receives the input text, returns the vector. */
  embeddingFor?: (input: string) => number[]
}

export interface FakeOpenRouterServer {
  baseUrl: string
  requests: CapturedLlmRequest[]
  setScenario: (s: FakeOpenRouterScenario) => void
  shutdown: () => Promise<void>
}

function buildStreamingResponse(model: string, r: ChatCompletionResponse): Response {
  const id = `chatcmpl-${Date.now()}`
  const created = Math.floor(Date.now() / 1000)

  const chunks: Array<Record<string, unknown>> = []

  // First chunk: role
  chunks.push({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
  })

  if (r.text) {
    // Yield text in small slices to mimic real streaming.
    const slices = r.text.match(/.{1,8}/g) ?? [r.text]
    for (const slice of slices) {
      chunks.push({
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{ index: 0, delta: { content: slice }, finish_reason: null }],
      })
    }
  }

  if (r.toolCalls && r.toolCalls.length > 0) {
    for (const [i, tc] of r.toolCalls.entries()) {
      chunks.push({
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: i,
                  id: tc.id ?? `call_${i}_${Date.now()}`,
                  type: 'function',
                  function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      })
    }
  }

  const finishReason = r.finishReason ?? (r.toolCalls && r.toolCalls.length > 0 ? 'tool_calls' : 'stop')
  chunks.push({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    usage: r.usage ?? { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
  })

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    },
  })
}

function buildResponseBody(c: Context, model: string, r: ChatCompletionResponse): Response {
  if (r.httpStatus && r.httpStatus >= 400) {
    return c.json(r.httpBody ?? { error: { message: 'fake error' } }, r.httpStatus as 400 | 500)
  }

  const toolCalls = r.toolCalls?.map((tc, i) => ({
    id: tc.id ?? `call_${i}_${Date.now()}`,
    type: 'function' as const,
    function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
  }))

  const finishReason = r.finishReason ?? (toolCalls && toolCalls.length > 0 ? 'tool_calls' : 'stop')

  const message: Record<string, unknown> = {
    role: 'assistant',
    content: r.text ?? null,
  }
  if (toolCalls && toolCalls.length > 0) {
    message.tool_calls = toolCalls
  }

  return c.json({
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, finish_reason: finishReason, message }],
    usage: r.usage ?? { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
  })
}

export async function spawnFakeOpenRouter(): Promise<FakeOpenRouterServer> {
  const requests: CapturedLlmRequest[] = []
  let scenario: FakeOpenRouterScenario = {}
  let responseIndex = 0

  const app = new Hono()

  app.use('*', async (c, next) => {
    if (c.req.method === 'POST') {
      const body = (await c.req.json().catch(() => ({}))) as ChatCompletionRequest
      requests.push({
        body,
        headers: Object.fromEntries(c.req.raw.headers.entries()),
      })
      // Re-inject parsed body so handler can read again
      c.set('parsedBody', body)
    }
    await next()
  })

  app.post('/v1/chat/completions', (c) => {
    const body = c.get('parsedBody') as ChatCompletionRequest

    const picked = scenario.selectResponse?.(body) ?? scenario.responses?.[responseIndex]
    if (scenario.responses && !scenario.selectResponse) {
      responseIndex++
    }

    if (!picked) {
      return c.json({ error: { message: 'fake-openrouter: no scenario response configured' } }, 500)
    }

    if (body.stream) {
      return buildStreamingResponse(body.model, picked)
    }

    return buildResponseBody(c, body.model, picked)
  })

  // OpenAI-compatible embeddings endpoint — supports per-input override via scenario.embeddingFor.
  app.post('/v1/embeddings', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { input?: string | string[]; model?: string }
    const inputs = Array.isArray(body.input) ? body.input : [body.input ?? '']
    const defaultVec = scenario.embedding ?? new Array(1536).fill(0).map((_, j) => Math.sin(j * 0.1))
    return c.json({
      object: 'list',
      data: inputs.map((input, i) => ({
        object: 'embedding',
        index: i,
        embedding: scenario.embeddingFor?.(String(input)) ?? defaultVec,
      })),
      model: body.model ?? 'text-embedding-3-small',
      usage: { prompt_tokens: 1, total_tokens: 1 },
    })
  })

  app.all('*', (c) => c.json({ error: { message: 'fake-openrouter: route not stubbed' } }, 404))

  const server: Server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch })
  const baseUrl = `http://127.0.0.1:${server.port}/v1`

  return {
    baseUrl,
    requests,
    setScenario: (s) => {
      scenario = s
      responseIndex = 0
    },
    shutdown: async () => {
      server.stop(true)
    },
  }
}
