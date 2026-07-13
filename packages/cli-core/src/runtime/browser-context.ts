import type { ChatMessage } from './provider'

/**
 * Browser-snapshot context policy: only the latest a11y snapshot stays live.
 *
 * A snapshot's a11y tree is large and only the newest one reflects the page the
 * model is acting on, so every older snapshot in history is superseded down to a
 * one-line stub. Snapshots are identified by a stable leading marker in the tool
 * result content — content-based, so the policy holds within a turn and across
 * turns (superseded stubs persist into the next turn's prior messages) without
 * threading tool-call ids through the runtime. The result: a long browser
 * session keeps exactly one snapshot in context, so the input-token curve stays
 * flat instead of growing one tree per observation (MVP exit #3).
 */

export const SNAPSHOT_CONTENT_MARKER = '[browser_snapshot]'

export const SNAPSHOT_SUPERSEDED_STUB = `${SNAPSHOT_CONTENT_MARKER} superseded — a newer snapshot is below; re-run browser_snapshot to observe this page again`

/** A tool message that carries a live (not-yet-superseded) browser snapshot. */
export function isLiveSnapshot(message: ChatMessage): boolean {
  return (
    message.role === 'tool' &&
    message.content.startsWith(SNAPSHOT_CONTENT_MARKER) &&
    message.content !== SNAPSHOT_SUPERSEDED_STUB
  )
}

/**
 * Collapse every live snapshot except the most recent to a stub, mutating
 * `messages` in place. Returns the number newly evicted (0 when there is at most
 * one live snapshot, so calling it after each tool round is cheap and idempotent).
 */
export function supersedeSnapshots(messages: ChatMessage[]): number {
  const liveIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (isLiveSnapshot(messages[i]!)) liveIndices.push(i)
  }
  if (liveIndices.length <= 1) return 0

  let evicted = 0
  for (let k = 0; k < liveIndices.length - 1; k++) {
    const index = liveIndices[k]!
    messages[index] = { ...messages[index]!, content: SNAPSHOT_SUPERSEDED_STUB }
    evicted++
  }
  return evicted
}
