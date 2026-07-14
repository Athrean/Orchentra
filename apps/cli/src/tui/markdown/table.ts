// Layout helpers for rendering GFM tables in the TUI. Kept pure (no Ink) so
// the width/wrap math is unit-testable; MarkdownView composes the border glyphs
// and inline styling on top of what these return.

import { tokenizeInline } from './inline'

export type CellAlign = 'left' | 'center' | 'right'

const MIN_COL_WIDTH = 3
const MAX_NATURAL_COL_WIDTH = 60
// Per-column structural overhead of `│ … ` — one leading bar plus a padding
// space each side. The closing bar is counted once for the whole row.
const CELL_OVERHEAD = 3

/**
 * Rendered width of a cell's inline markdown — mirrors how MarkdownView's
 * `Inline` actually paints each token so padding lines up. Code spans keep
 * their backticks (+2); a link shows `text` plus ` (href)` when they differ.
 */
export function inlineWidth(text: string): number {
  let w = 0
  for (const tok of tokenizeInline(text)) {
    switch (tok.kind) {
      case 'text':
      case 'bold':
      case 'italic':
        w += glyphWidth(tok.value)
        break
      case 'code':
        w += glyphWidth(tok.value) + 2
        break
      case 'link':
        w += glyphWidth(tok.text) + (tok.text === tok.href ? 0 : glyphWidth(tok.href) + 3)
        break
    }
  }
  return w
}

// Code-point count. Good enough for the ASCII-heavy content tables carry;
// avoids pulling in a full grapheme/east-asian-width dependency.
function glyphWidth(s: string): number {
  return Array.from(s).length
}

/**
 * Column widths that fit the whole table into `available` columns. Starts from
 * each column's natural (longest-cell) width, then repeatedly shaves a column
 * off the widest until the row fits — so the long free-text column gives up
 * space first while short columns (ids, labels) stay intact.
 */
export function computeColumnWidths(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  available: number,
): number[] {
  const cols = headers.length
  // Natural width = longest cell, capped. The MIN floor is applied only while
  // shrinking, so a genuinely narrow column (a `#` id) is not padded out.
  const widths = headers.map((h, c) => {
    let w = inlineWidth(h)
    for (const row of rows) w = Math.max(w, inlineWidth(row[c] ?? ''))
    return Math.min(Math.max(w, 1), MAX_NATURAL_COL_WIDTH)
  })

  const overhead = CELL_OVERHEAD * cols + 1
  const budget = Math.max(cols * MIN_COL_WIDTH, available - overhead)
  let total = widths.reduce((a, b) => a + b, 0)
  while (total > budget) {
    // Shrink the widest column that is still above the floor.
    let widest = -1
    for (let c = 0; c < cols; c++) {
      if (widths[c] > MIN_COL_WIDTH && (widest === -1 || widths[c] > widths[widest])) widest = c
    }
    if (widest === -1) break
    widths[widest]--
    total--
  }
  return widths
}

/**
 * Word-wrap a cell's raw markdown to segments each no wider than `width`
 * rendered columns. Words are kept whole where possible; a single word longer
 * than the column is hard-split by code point. Never returns an empty array.
 */
export function wrapCell(text: string, width: number): string[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    const candidate = cur.length === 0 ? word : `${cur} ${word}`
    if (inlineWidth(candidate) <= width) {
      cur = candidate
      continue
    }
    if (cur.length > 0) {
      lines.push(cur)
      cur = ''
    }
    if (inlineWidth(word) <= width) {
      cur = word
      continue
    }
    // Overlong single word: hard-break by code point.
    let chunk = ''
    for (const ch of Array.from(word)) {
      if (inlineWidth(chunk + ch) > width && chunk.length > 0) {
        lines.push(chunk)
        chunk = ''
      }
      chunk += ch
    }
    cur = chunk
  }
  if (cur.length > 0) lines.push(cur)
  return lines.length > 0 ? lines : ['']
}
