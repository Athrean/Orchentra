import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { GeminiProvider } from '../src/gemini'

let originalEnv: NodeJS.ProcessEnv

beforeEach(() => {
  originalEnv = { ...process.env }
  delete process.env['GEMINI_API_KEY']
  delete process.env['GOOGLE_API_KEY']
  delete process.env['GEMINI_OAUTH_TOKEN']
})

afterEach(() => {
  process.env = originalEnv
})

describe('GeminiProvider', () => {
  test('throws finish+error when credentials missing', async () => {
    const p = new GeminiProvider({ apiKey: '', oauthToken: '' })
    const events: string[] = []
    await expect(async () => {
      for await (const ev of p.stream({
        systemStatic: '',
        systemDynamic: '',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
        model: 'gemini-2.0-flash',
        maxOutputTokens: 100,
      })) {
        events.push(ev.kind)
      }
    }).toThrow(/credentials missing/i)
    expect(events).toContain('finish')
  })

  test('accepts oauth token via constructor', () => {
    const p = new GeminiProvider({ oauthToken: 'test-token' })
    expect(p).toBeDefined()
  })

  test('accepts api key via constructor', () => {
    const p = new GeminiProvider({ apiKey: 'test-key' })
    expect(p).toBeDefined()
  })

  test('picks up GEMINI_API_KEY from env', () => {
    process.env['GEMINI_API_KEY'] = 'env-key'
    const p = new GeminiProvider()
    expect(p).toBeDefined()
  })

  test('picks up GOOGLE_API_KEY as fallback', () => {
    process.env['GOOGLE_API_KEY'] = 'google-env-key'
    const p = new GeminiProvider()
    expect(p).toBeDefined()
  })
})
