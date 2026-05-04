/**
 * Cursor-position helpers for word-aware navigation in the input buffer.
 *
 * `wordBoundaryLeft` / `wordBoundaryRight` mirror the behavior of the
 * `alt+←` / `alt+→` chord in standard terminal line editors: skip any
 * adjacent whitespace, then skip the word-character run, and stop at the
 * next boundary. The helpers operate on plain string buffers so they are
 * trivially testable without rendering any UI.
 */

const WORD_RE = /\S/

export function wordBoundaryLeft(buffer: string, cursor: number): number {
  let i = Math.min(cursor, buffer.length)
  while (i > 0 && !WORD_RE.test(buffer[i - 1] ?? '')) i -= 1
  while (i > 0 && WORD_RE.test(buffer[i - 1] ?? '')) i -= 1
  return i
}

export function wordBoundaryRight(buffer: string, cursor: number): number {
  let i = Math.max(0, cursor)
  while (i < buffer.length && !WORD_RE.test(buffer[i] ?? '')) i += 1
  while (i < buffer.length && WORD_RE.test(buffer[i] ?? '')) i += 1
  return i
}

/**
 * Removes the word ending at `cursor`, returning the new buffer + cursor.
 * Used by `ctrl+w`. Sharing the boundary logic with the cursor-only
 * helpers keeps `alt+←` and `ctrl+w` in lockstep.
 */
export function deleteWordBack(buffer: string, cursor: number): { buffer: string; cursor: number } {
  const start = wordBoundaryLeft(buffer, cursor)
  return { buffer: buffer.slice(0, start) + buffer.slice(cursor), cursor: start }
}
