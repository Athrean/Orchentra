import type { ChatChunk, ChatMessage } from './types'
import { streamFromAnthropic } from './anthropic'
import { streamFromOpenAI } from './openai'

export type LlmProvider = 'anthropic' | 'openai'

export async function* streamFromProvider(opts: {
  provider: LlmProvider
  apiKey: string
  messages: ChatMessage[]
  model?: string
}): AsyncGenerator<ChatChunk> {
  if (opts.provider === 'anthropic') {
    yield* streamFromAnthropic(opts)
    return
  }
  if (opts.provider === 'openai') {
    yield* streamFromOpenAI(opts)
    return
  }
  yield { type: 'error', error: `unknown provider: ${opts.provider}` }
}

export * from './types'
