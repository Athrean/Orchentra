import { describe, expect, it } from 'bun:test'
import { validateProviderKey } from '../lib/ai-providers/key-tester'

describe('validateProviderKey', () => {
  it('validates OpenAI-compatible success responses', async () => {
    const calls: Array<{ url: string; init: Parameters<typeof fetch>[1] }> = []
    const result = await validateProviderKey({
      provider: 'openai',
      apiKey: 'sk-test',
      fetcher: async (url, init) => {
        calls.push({ url: String(url), init })
        return new Response('{}', { status: 200 })
      },
    })

    expect(result).toEqual({ ok: true })
    expect(calls[0].url).toBe('https://api.openai.com/v1/models')
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  it('distinguishes auth failures', async () => {
    const result = await validateProviderKey({
      provider: 'anthropic',
      apiKey: 'sk-ant-test',
      fetcher: async () => new Response('{}', { status: 401 }),
    })

    expect(result.ok).toBe(false)
    expect(result.kind).toBe('auth')
    expect(result.error).toContain('Authentication failed')
  })

  it('distinguishes network errors', async () => {
    const result = await validateProviderKey({
      provider: 'google',
      apiKey: 'AIza-test',
      fetcher: async () => {
        throw new Error('socket closed')
      },
    })

    expect(result).toEqual({ ok: false, kind: 'network', error: 'socket closed' })
  })
})
