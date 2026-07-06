import type { ChatMessage } from './provider'

/**
 * Conversation-rewind geometry. A "turn" begins at a user message, so rewinding
 * N turns means dropping everything from the Nth-from-last user message to the
 * end (its assistant reply + tool exchanges included). Pure so the truncation
 * is trivially testable; the runtime just slices `messages` at the boundary.
 */

/** Index to keep messages `[0, idx)` when dropping the last `turns` user-turns.
 * `turns <= 0` keeps everything; `turns >= userTurns` truncates to empty. */
export function rewindBoundary(messages: readonly ChatMessage[], turns: number): number {
  if (turns <= 0) return messages.length
  const userIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') userIndices.push(i)
  }
  if (turns >= userIndices.length) return 0
  return userIndices[userIndices.length - turns]
}

/** Number of user-turns present in a message slice. */
export function countUserTurns(messages: readonly ChatMessage[]): number {
  let n = 0
  for (const m of messages) if (m.role === 'user') n++
  return n
}

/**
 * Line-level churn for transforming `from` into `to`: how many lines the change
 * adds and removes, matching identical lines by multiplicity (order-insensitive
 * multiset diff). Cheap (O(n), no LCS table) and honest enough to preview what a
 * rewind's file revert will change before it runs — the look-before-you-leap gate.
 */
export function lineDiffStats(from: string, to: string): { added: number; removed: number } {
  const fromLines = from.length === 0 ? [] : from.split('\n')
  const toLines = to.length === 0 ? [] : to.split('\n')
  const remaining = new Map<string, number>()
  for (const line of fromLines) remaining.set(line, (remaining.get(line) ?? 0) + 1)
  let added = 0
  for (const line of toLines) {
    const count = remaining.get(line) ?? 0
    if (count > 0) remaining.set(line, count - 1)
    else added++
  }
  let removed = 0
  remaining.forEach((count) => {
    removed += count
  })
  return { added, removed }
}
