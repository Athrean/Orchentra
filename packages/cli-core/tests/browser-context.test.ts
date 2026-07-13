import { describe, expect, test } from 'bun:test'
import {
  SNAPSHOT_CONTENT_MARKER,
  SNAPSHOT_SUPERSEDED_STUB,
  isLiveSnapshot,
  supersedeSnapshots,
} from '../src/runtime/browser-context'
import { estimateMessagesTokens } from '../src/runtime/compaction'
import type { ChatMessage } from '../src/runtime/provider'

function snapshotMessage(step: number): ChatMessage {
  // A realistically sized a11y tree body.
  const tree = Array.from({ length: 40 }, (_, i) => `  [e${step}_${i}] textbox "field ${i}" = "value ${i}"`).join('\n')
  return {
    role: 'tool',
    content: `${SNAPSHOT_CONTENT_MARKER} url: http://localhost/step${step}\n${tree}`,
    toolCallId: `s${step}`,
  }
}

function liveCount(messages: ChatMessage[]): number {
  return messages.filter(isLiveSnapshot).length
}

describe('supersedeSnapshots', () => {
  test('keeps only the latest snapshot live, stubs the rest', () => {
    const messages: ChatMessage[] = [snapshotMessage(1), snapshotMessage(2), snapshotMessage(3)]
    const evicted = supersedeSnapshots(messages)
    expect(evicted).toBe(2)
    expect(liveCount(messages)).toBe(1)
    expect(isLiveSnapshot(messages[2]!)).toBe(true)
    expect(messages[0]!.content).toBe(SNAPSHOT_SUPERSEDED_STUB)
    expect(messages[1]!.content).toBe(SNAPSHOT_SUPERSEDED_STUB)
  })

  test('is idempotent and a no-op with 0 or 1 snapshots', () => {
    const one: ChatMessage[] = [{ role: 'user', content: 'hi' }, snapshotMessage(1)]
    expect(supersedeSnapshots(one)).toBe(0)
    expect(liveCount(one)).toBe(1)

    const many: ChatMessage[] = [snapshotMessage(1), snapshotMessage(2)]
    supersedeSnapshots(many)
    expect(supersedeSnapshots(many)).toBe(0) // already collapsed
  })

  test('does not touch non-snapshot tool results', () => {
    const messages: ChatMessage[] = [
      { role: 'tool', content: 'exit code 0', toolCallId: 't1' },
      snapshotMessage(1),
      { role: 'tool', content: 'grep results', toolCallId: 't2' },
      snapshotMessage(2),
    ]
    supersedeSnapshots(messages)
    expect(messages[0]!.content).toBe('exit code 0')
    expect(messages[2]!.content).toBe('grep results')
    expect(liveCount(messages)).toBe(1)
  })

  test('20-step session retains exactly one snapshot with a flat token curve (MVP exit #3)', () => {
    // A realistic base context (system + code) dominates; snapshots must not
    // accumulate one tree per step on top of it.
    const base: ChatMessage = { role: 'user', content: 'x'.repeat(40_000) }
    const messages: ChatMessage[] = [base]
    const curve: number[] = []

    for (let step = 1; step <= 20; step++) {
      messages.push({
        role: 'assistant',
        content: '',
        toolCalls: [{ id: `s${step}`, name: 'browser_snapshot', input: {} }],
      })
      messages.push(snapshotMessage(step))
      supersedeSnapshots(messages)
      curve.push(estimateMessagesTokens(messages))
    }

    expect(liveCount(messages)).toBe(1)

    const min = Math.min(...curve)
    const max = Math.max(...curve)
    expect((max - min) / min).toBeLessThanOrEqual(0.1)

    // Contrast: without eviction, 20 live trees balloon the curve far past +10%.
    const noEvict: ChatMessage[] = [base]
    for (let step = 1; step <= 20; step++) noEvict.push(snapshotMessage(step))
    expect(estimateMessagesTokens(noEvict)).toBeGreaterThan(max * 1.3)
  })
})
