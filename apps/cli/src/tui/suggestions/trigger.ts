import type { SuggestionTrigger } from '../types'

/**
 * Decide whether the buffer + cursor position should pop a suggestion menu,
 * and which trigger it is. Returns `null` for "no menu."
 *
 * Rules:
 *  - `/` only triggers when at column 0 of the buffer (slash commands are
 *    line-leading, like every other CLI).
 *  - `@` and `!` trigger when the trigger char is preceded by start-of-buffer
 *    or whitespace (so an email like `foo@bar` doesn't pop the menu).
 *  - Token continues up to the cursor; whitespace ends the token.
 */
export interface TriggerHit {
  readonly trigger: SuggestionTrigger
  /** Buffer index of the trigger char itself. */
  readonly anchorStart: number
  /** Substring after the trigger up to the cursor — this is the live query. */
  readonly query: string
}

export function detectTrigger(buffer: string, cursor: number): TriggerHit | null {
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = buffer[i]
    if (ch === ' ' || ch === '\t' || ch === '\n') return null

    if (ch === '/') {
      if (i !== 0) return null
      return { trigger: '/', anchorStart: i, query: buffer.slice(i + 1, cursor) }
    }

    if (ch === '@' || ch === '!') {
      const prev = i === 0 ? null : buffer[i - 1]
      if (prev === null || prev === ' ' || prev === '\t' || prev === '\n') {
        return { trigger: ch, anchorStart: i, query: buffer.slice(i + 1, cursor) }
      }
      return null
    }
  }
  return null
}
