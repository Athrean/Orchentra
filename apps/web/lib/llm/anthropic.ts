import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, ChatChunk } from './types'

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const SYSTEM_PROMPT =
  'You are Orchentra, an AI ops assistant. You help engineers understand and operate their CI pipelines, GitHub Actions, image scans, and incident triage. Keep responses focused and pragmatic. Default to terse when the user wants speed; expand when they ask for depth.'

export async function* streamFromAnthropic(opts: {
  apiKey: string
  messages: ChatMessage[]
  model?: string
}): AsyncGenerator<ChatChunk> {
  const client = new Anthropic({ apiKey: opts.apiKey })
  try {
    const stream = await client.messages.stream({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: opts.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
    })
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'token', text: event.delta.text }
      }
    }
    yield { type: 'done' }
  } catch (err) {
    yield { type: 'error', error: err instanceof Error ? err.message : 'anthropic stream failed' }
  }
}
