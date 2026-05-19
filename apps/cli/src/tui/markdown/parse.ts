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

export type Block = CodeBlock | Heading | Paragraph | ListBlock | Quote

const FENCE_RE = /^([`~]{3,})([A-Za-z0-9_+-]*)\s*$/
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const ULIST_RE = /^[-*+]\s+(.+)$/
const OLIST_RE = /^\d+[.)]\s+(.+)$/
const QUOTE_RE = /^>\s?(.*)$/

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
      paragraphLines.push(next)
      i++
    }
    blocks.push({ kind: 'paragraph', text: paragraphLines.join('\n') })
  }

  return blocks
}
