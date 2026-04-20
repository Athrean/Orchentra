import { describe, expect, test } from 'bun:test'
import { compact, shouldCompact } from '../src/runtime/compaction'
import type { ChatMessage } from '../src/runtime/provider'

function msgs(count: number, prefix = 'msg'): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: 'user' as const,
    content: `${prefix}-${i} ${'x'.repeat(100)}`,
  }))
}

describe('shouldCompact', () => {
  test('returns false when under threshold', () => {
    expect(shouldCompact(msgs(2), 10000, 0.7)).toBe(false)
  })

  test('returns true when at threshold', () => {
    const charCounter = (t: string): number => t.length
    const messages = msgs(20)
    const used = messages.reduce((s, m) => s + charCounter(m.content) + 4, 0)
    expect(shouldCompact(messages, used, 0.5, charCounter)).toBe(true)
  })
})

describe('compact', () => {
  test('no-op when messages fit in keepRecent', () => {
    const messages = msgs(3)
    const r = compact({ messages, contextWindowTokens: 10000, thresholdRatio: 0.7, keepRecent: 5 })
    expect(r.compacted).toBe(false)
    expect(r.messages).toEqual(messages)
  })

  test('drops old messages and keeps recent', () => {
    const messages = msgs(10)
    const r = compact({ messages, contextWindowTokens: 10000, thresholdRatio: 0.7, keepRecent: 3 })
    expect(r.compacted).toBe(true)
    expect(r.droppedCount).toBe(7)
    expect(r.messages).toHaveLength(4) // 1 summary + 3 recent
    expect(r.messages[0]!.content).toContain('context-compacted')
    expect(r.messages[1]!.content).toContain('msg-7')
    expect(r.messages[3]!.content).toContain('msg-9')
  })

  test('summary captures tool call IDs', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'do it' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'tc1', name: 'read', input: {} }] },
      { role: 'tool', content: 'ok', toolCallId: 'tc1' },
      { role: 'user', content: 'more' },
    ]
    const r = compact({ messages, contextWindowTokens: 10, thresholdRatio: 0.1, keepRecent: 1 })
    expect(r.summary).toContain('tc1')
  })
})
