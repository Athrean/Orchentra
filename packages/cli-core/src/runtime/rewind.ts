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
