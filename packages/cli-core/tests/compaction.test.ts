import { describe, expect, test } from 'bun:test'
import { compact, compactWithSummary, shouldCompact, type CompactionInput } from '../src/runtime/compaction'
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

  test('pair-safe boundary: retained window never opens on orphaned tool results', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: `start ${'x'.repeat(100)}` },
      { role: 'user', content: `context ${'x'.repeat(100)}` },
      { role: 'assistant', content: '', toolCalls: [{ id: 'tc1', name: 'read', input: {} }] },
      { role: 'tool', content: 'result 1', toolCallId: 'tc1' },
      { role: 'tool', content: 'result 2', toolCallId: 'tc2' },
      { role: 'user', content: 'final' },
    ]
    // keepRecent 3 would naively slice at index 3 — right on the tool results,
    // orphaning them from their assistant tool-call turn.
    const r = compact({ messages, contextWindowTokens: 10, thresholdRatio: 0.1, keepRecent: 3 })
    expect(r.compacted).toBe(true)
    expect(r.messages[0]!.content).toContain('context-compacted')
    expect(r.messages[1]!.role).toBe('assistant')
    expect(r.messages[1]!.toolCalls?.[0]?.id).toBe('tc1')
    expect(r.messages[2]!.role).toBe('tool')
    expect(r.droppedCount).toBe(2)
  })

  test('pair-safe boundary: no compaction when walking back reaches the start', () => {
    const messages: ChatMessage[] = [
      { role: 'assistant', content: '', toolCalls: [{ id: 'tc1', name: 'read', input: {} }] },
      { role: 'tool', content: 'result 1', toolCallId: 'tc1' },
      { role: 'tool', content: 'result 2', toolCallId: 'tc2' },
    ]
    const r = compact({ messages, contextWindowTokens: 10, thresholdRatio: 0.1, keepRecent: 1 })
    expect(r.compacted).toBe(false)
    expect(r.messages).toEqual(messages)
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

describe('compactWithSummary', () => {
  const input = (messages: ChatMessage[], keepRecent = 3): CompactionInput => ({
    messages,
    contextWindowTokens: 10000,
    thresholdRatio: 0.7,
    keepRecent,
  })

  test('no-op when messages fit in keepRecent', async () => {
    const messages = msgs(3)
    const r = await compactWithSummary(input(messages, 5))
    expect(r.compacted).toBe(false)
    expect(r.messages).toEqual(messages)
  })

  test('without a summarizer, matches the deterministic compact() exactly', async () => {
    const messages = msgs(10)
    const withLlm = await compactWithSummary(input(messages))
    const deterministic = compact(input(messages))
    expect(withLlm).toEqual(deterministic)
  })

  test('embeds the LLM summary and keeps the live zone byte-identical and in order', async () => {
    const messages = msgs(10)
    const summarizer = async (): Promise<string> => 'LLM digest of earlier turns'
    const r = await compactWithSummary(input(messages, 2), summarizer)

    expect(r.compacted).toBe(true)
    expect(r.droppedCount).toBe(8)
    expect(r.messages[0]!.content).toContain('context-compacted')
    expect(r.messages[0]!.content).toContain('LLM digest of earlier turns')
    // Live zone: the retained recent messages must be unchanged and ordered.
    expect(r.messages.slice(1)).toEqual(messages.slice(8))
    expect(r.summary).toBe('LLM digest of earlier turns')
  })

  test('falls back to the deterministic summary when the summarizer throws', async () => {
    const messages = msgs(6)
    const summarizer = async (): Promise<string> => {
      throw new Error('provider down')
    }
    const r = await compactWithSummary(input(messages, 2), summarizer)
    const deterministic = compact(input(messages, 2))
    expect(r.summary).toBe(deterministic.summary)
    expect(r.compacted).toBe(true)
  })

  test('falls back to the deterministic summary when the summarizer returns blank', async () => {
    const messages = msgs(6)
    const r = await compactWithSummary(input(messages, 2), async () => '   ')
    const deterministic = compact(input(messages, 2))
    expect(r.summary).toBe(deterministic.summary)
  })

  test('bounds an oversized LLM summary', async () => {
    const messages = msgs(6)
    const huge = 'z'.repeat(10000)
    const r = await compactWithSummary(input(messages, 2), async () => huge)
    expect(r.summary.length).toBeLessThanOrEqual(2001)
    expect(r.summary).not.toBe(huge)
  })
})
