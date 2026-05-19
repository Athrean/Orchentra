/**
 * Count the number of terminal rows a buffer would occupy after soft-wrapping
 * at `width` columns. Used by the TUI to decide when to swap the inline input
 * for a multi-line modal overlay (≥ 5 wrapped lines).
 *
 * Implementation notes:
 *  - Each `\n` ends a logical line; an empty logical line still occupies 1 row.
 *  - A logical line longer than `width` wraps to `ceil(len / width)` rows.
 *  - When `width <= 0` (non-TTY / unknown size), we fall back to the logical
 *    line count so the threshold still has something sensible to bite on.
 *
 * Pure: same inputs → same output, no I/O.
 */
export function countWrappedLines(buffer: string, width: number): number {
  const lines = buffer.split('\n')
  if (width <= 0) return lines.length
  let total = 0
  for (const line of lines) {
    if (line.length === 0) {
      total += 1
      continue
    }
    total += Math.ceil(line.length / width)
  }
  return total
}
