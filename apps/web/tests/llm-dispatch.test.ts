import { describe, expect, it } from 'bun:test'
import { chatRequestSchema, streamFromProvider } from '../lib/llm'

describe('chatRequestSchema', () => {
  it('rejects empty messages array', () => {
    const r = chatRequestSchema.safeParse({ messages: [] })
    expect(r.success).toBe(false)
  })

  it('rejects more than 50 messages', () => {
    const msgs = Array.from({ length: 51 }, () => ({ role: 'user' as const, content: 'hi' }))
    const r = chatRequestSchema.safeParse({ messages: msgs })
    expect(r.success).toBe(false)
  })

  it('rejects content > 50_000 chars', () => {
    const r = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'x'.repeat(50_001) }],
    })
    expect(r.success).toBe(false)
  })
})

describe('streamFromProvider dispatch', () => {
  it('yields an error chunk for unknown provider', async () => {
    const gen = streamFromProvider({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider: 'bogus' as any,
      apiKey: 'k',
      messages: [{ role: 'user', content: 'hi' }],
    })
    const { value } = await gen.next()
    expect(value).toEqual({ type: 'error', error: 'unknown provider: bogus' })
  })
})
