// Tiny markdown subset parser: just enough to render assistant output
// nicely without dragging in a full CommonMark dependency.
//
// Block-level: fenced code blocks (```lang …```), ATX headers (# …),
// bullet/number lists (- *  + or 1. ), blockquotes (> …), and paragraphs.
// Inline parsing is handled separately in `inline.ts`.
//
// Performance: streaming assistant turns re-call the parser on every
// delta. To keep that cheap we (1) short-circuit prose without any
// markdown markers in the first window, (2) cache results in a small
// LRU keyed by content, and (3) normalize nested fences so the
// `here is markdown showing markdown` pattern doesn't corrupt the lex.

import { LruCache } from './cache'
import { isPlainText } from './short-circuit'
import { normalizeNestedFences } from './normalize-fences'
import type { CellAlign } from './table'

export interface CodeBlock {
  readonly kind: 'code'
  readonly lang: string
  readonly text: string
}

export interface Heading {
  readonly kind: 'heading'
  readonly level: 1 | 2 | 3 | 4 | 5 | 6
  readonly text: string
}

export interface Paragraph {
  readonly kind: 'paragraph'
  readonly text: string
}

export interface ListBlock {
  readonly kind: 'list'
  readonly ordered: boolean
  readonly items: readonly string[]
}

export interface Quote {
  readonly kind: 'quote'
  readonly text: string
}

export interface TableBlock {
  readonly kind: 'table'
  readonly headers: readonly string[]
  readonly aligns: readonly CellAlign[]
  readonly rows: readonly (readonly string[])[]
}

export type Block = CodeBlock | Heading | Paragraph | ListBlock | Quote | TableBlock

const FENCE_RE = /^([`~]{3,})([A-Za-z0-9_+-]*)\s*$/
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const ULIST_RE = /^[-*+]\s+(.+)$/
const OLIST_RE = /^\d+[.)]\s+(.+)$/
const QUOTE_RE = /^>\s?(.*)$/
const TABLE_DELIM_CELL_RE = /^:?-{1,}:?$/

// Split one table row into trimmed cells, tolerating optional outer pipes and
// `\|` escapes. `| a | b |`, `a | b`, and `| a | b` all yield ['a', 'b'].
function splitTableRow(line: string): string[] {
  const s = line.trim()
  const cells: string[] = []
  let buf = ''
  const start = s.startsWith('|') ? 1 : 0
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && s[i + 1] === '|') {
      buf += '|'
      i++
      continue
    }
    if (ch === '|') {
      cells.push(buf.trim())
      buf = ''
      continue
    }
    buf += ch
  }
  // A trailing pipe leaves an empty buffer we should not emit as a cell.
  if (buf.trim().length > 0 || !s.endsWith('|')) cells.push(buf.trim())
  return cells
}

// A delimiter row is all `---`/`:--`/`--:`/`:-:` cells; returns per-column
// alignment, or null when any cell is not delimiter-shaped.
function parseDelimiterRow(cells: readonly string[]): CellAlign[] | null {
  if (cells.length === 0) return null
  const aligns: CellAlign[] = []
  for (const raw of cells) {
    const c = raw.trim()
    if (!TABLE_DELIM_CELL_RE.test(c)) return null
    const left = c.startsWith(':')
    const right = c.endsWith(':')
    aligns.push(left && right ? 'center' : right ? 'right' : left ? 'left' : 'left')
  }
  return aligns
}

// True when `lines[i]` is a GFM table header followed by a matching delimiter
// row. Requires equal column counts so a prose line above a `---` rule (setext
// heading) is not misread as a table.
function isTableStart(lines: readonly string[], i: number): boolean {
  const header = lines[i]
  const delim = lines[i + 1]
  if (header === undefined || delim === undefined) return false
  if (!header.includes('|')) return false
  const headerCells = splitTableRow(header)
  if (headerCells.length < 1) return false
  const delimCells = splitTableRow(delim)
  if (delimCells.length !== headerCells.length) return false
  return parseDelimiterRow(delimCells) !== null
}

interface FenceOpen {
  readonly ch: '`' | '~'
  readonly run: number
  readonly lang: string
}

function parseFenceOpen(line: string): FenceOpen | null {
  const m = FENCE_RE.exec(line)
  if (!m) return null
  const run = m[1].length
  const ch = m[1][0] as '`' | '~'
  return { ch, run, lang: m[2] ?? '' }
}

function isFenceClose(line: string, open: FenceOpen): boolean {
  // A fence is closed by a run of the SAME char of length >= the opening run
  // and nothing but whitespace on the rest of the line.
  let n = 0
  while (n < line.length && line[n] === open.ch) n++
  if (n < open.run) return false
  return line.slice(n).trim().length === 0
}

const CACHE_CAPACITY = 500
const tokenCache = new LruCache<string, Block[]>(CACHE_CAPACITY)
let lexerSpy: (() => void) | null = null

/** Test-only: clear the parse cache between cases. */
export function resetParseMarkdownCache(): void {
  tokenCache.clear()
}

/** Test-only: read the current cache size. */
export function getParseMarkdownCacheSize(): number {
  return tokenCache.size
}

/** Test-only: install a hook that is invoked exactly when the lexer runs. */
export function setParseMarkdownLexerSpy(fn: (() => void) | null): void {
  lexerSpy = fn
}

export function parseMarkdown(input: string): Block[] {
  const cached = tokenCache.get(input)
  if (cached) return cached
  // Short-circuit only when (a) no markdown markers appear in the first
  // 500 chars AND (b) no blank-line paragraph split is present. The
  // blank-line check preserves multi-paragraph behaviour for the lexer.
  if (isPlainText(input) && !input.includes('\n\n')) {
    const blocks: Block[] = input.length === 0 ? [] : [{ kind: 'paragraph', text: input }]
    tokenCache.set(input, blocks)
    return blocks
  }
  if (lexerSpy) lexerSpy()
  const normalized = normalizeNestedFences(input)
  const blocks = lex(normalized)
  tokenCache.set(input, blocks)
  return blocks
}

function lex(input: string): Block[] {
  const lines = input.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code (backtick or tilde, any run length >= 3). A fence is
    // closed only by a same-char run of length >= the opener's run, so
    // inner fence sequences of shorter length are preserved as content.
    const fenceOpen = parseFenceOpen(line)
    if (fenceOpen) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !isFenceClose(lines[i], fenceOpen)) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++
      blocks.push({ kind: 'code', lang: fenceOpen.lang, text: codeLines.join('\n') })
      continue
    }

    // GFM table: header row + delimiter row, then contiguous piped data rows.
    if (isTableStart(lines, i)) {
      const headers = splitTableRow(lines[i])
      const aligns = parseDelimiterRow(splitTableRow(lines[i + 1])) ?? []
      const cols = headers.length
      const normAligns: CellAlign[] = Array.from({ length: cols }, (_, c) => aligns[c] ?? 'left')
      i += 2
      const rows: string[][] = []
      while (i < lines.length) {
        const cur = lines[i]
        if (cur.trim().length === 0 || !cur.includes('|')) break
        const cells = splitTableRow(cur)
        rows.push(Array.from({ length: cols }, (_, c) => cells[c] ?? ''))
        i++
      }
      blocks.push({ kind: 'table', headers, aligns: normAligns, rows })
      continue
    }

    // Heading
    const heading = HEADING_RE.exec(line)
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6
      blocks.push({ kind: 'heading', level, text: heading[2] })
      i++
      continue
    }

    // Lists (consume contiguous list items)
    if (ULIST_RE.test(line) || OLIST_RE.test(line)) {
      const ordered = OLIST_RE.test(line)
      const items: string[] = []
      while (i < lines.length) {
        const cur = lines[i]
        const u = ULIST_RE.exec(cur)
        const o = OLIST_RE.exec(cur)
        if (ordered && o) items.push(o[1])
        else if (!ordered && u) items.push(u[1])
        else break
        i++
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }

    // Blockquote
    const quote = QUOTE_RE.exec(line)
    if (quote) {
      const buf: string[] = [quote[1]]
      i++
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        const m = QUOTE_RE.exec(lines[i])
        if (m) buf.push(m[1])
        i++
      }
      blocks.push({ kind: 'quote', text: buf.join('\n') })
      continue
    }

    // Skip blank lines between blocks
    if (line.trim().length === 0) {
      i++
      continue
    }

    // Paragraph: gather contiguous non-blank, non-special lines
    const paragraphLines: string[] = [line]
    i++
    while (i < lines.length) {
      const next = lines[i]
      if (next.trim().length === 0) break
      if (FENCE_RE.test(next)) break
      if (HEADING_RE.test(next)) break
      if (ULIST_RE.test(next) || OLIST_RE.test(next)) break
      if (QUOTE_RE.test(next)) break
      if (isTableStart(lines, i)) break
      paragraphLines.push(next)
      i++
    }
    blocks.push({ kind: 'paragraph', text: paragraphLines.join('\n') })
  }

  return blocks
}
