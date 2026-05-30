import { describe, expect, it } from 'bun:test'
import { chatBodySchema } from '../lib/ai/chat-request'

const oneMessage = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]

describe('chatBodySchema', () => {
  it('rejects an empty messages array', () => {
    expect(chatBodySchema.safeParse({ messages: [] }).success).toBe(false)
  })

  it('applies defaults for effort, adaptive and permission mode', () => {
    const parsed = chatBodySchema.parse({ messages: oneMessage })
    expect(parsed.effort).toBe('low')
    expect(parsed.adaptive).toBe(false)
    expect(parsed.permissionMode).toBe('ask')
    expect(parsed.model).toBeUndefined()
  })

  it('keeps provided model, effort, adaptive, permission mode and scope', () => {
    const parsed = chatBodySchema.parse({
      messages: oneMessage,
      model: 'claude-opus-4-8',
      effort: 'high',
      adaptive: true,
      permissionMode: 'act',
      scope: 'octo/repo',
    })
    expect(parsed).toMatchObject({
      model: 'claude-opus-4-8',
      effort: 'high',
      adaptive: true,
      permissionMode: 'act',
      scope: 'octo/repo',
    })
  })

  it('rejects an unknown effort value', () => {
    expect(chatBodySchema.safeParse({ messages: oneMessage, effort: 'turbo' }).success).toBe(false)
  })

  it('ignores extra transport keys (trigger, messageId)', () => {
    const parsed = chatBodySchema.parse({ messages: oneMessage, trigger: 'submit-message', messageId: 'x' })
    expect(parsed.messages).toHaveLength(1)
  })
})
