import OpenAI from 'openai'
import type { ChatMessage, ChatChunk } from './types'

const DEFAULT_MODEL = 'gpt-4o-mini'
const SYSTEM_PROMPT =
  'You are Orchentra, an AI ops assistant. You help engineers understand and operate their CI pipelines, GitHub Actions, image scans, and incident triage. Keep responses focused and pragmatic.'

export async function* streamFromOpenAI(opts: {
  apiKey: string
  messages: ChatMessage[]
  model?: string
}): AsyncGenerator<ChatChunk> {
  const client = new OpenAI({ apiKey: opts.apiKey })
  try {
    const stream = await client.chat.completions.create({
      model: opts.model ?? DEFAULT_MODEL,
      stream: true,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...opts.messages],
    })
    for await (const event of stream) {
      const text = event.choices[0]?.delta?.content
      if (text) yield { type: 'token', text }
    }
    yield { type: 'done' }
  } catch (err) {
    yield { type: 'error', error: err instanceof Error ? err.message : 'openai stream failed' }
  }
}
