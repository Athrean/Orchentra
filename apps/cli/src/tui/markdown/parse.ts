// Tiny markdown subset parser: just enough to render assistant output
// nicely without dragging in a full CommonMark dependency.
//
// Block-level: fenced code blocks (```lang …```), ATX headers (# …),
// bullet/number lists (- *  + or 1. ), blockquotes (> …), and paragraphs.
// Inline parsing is handled separately in `inline.ts`.

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

const FENCE_RE = /^```([A-Za-z0-9_+-]*)\s*$/
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const ULIST_RE = /^[-*+]\s+(.+)$/
const OLIST_RE = /^\d+[.)]\s+(.+)$/
const QUOTE_RE = /^>\s?(.*)$/

export function parseMarkdown(input: string): Block[] {
  const lines = input.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code
    const fence = FENCE_RE.exec(line)
    if (fence) {
      const lang = fence[1] ?? ''
      const codeLines: string[] = []
      i++
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        codeLines.push(lines[i])
        i++
      }
      // Skip the closing fence if present
      if (i < lines.length) i++
      blocks.push({ kind: 'code', lang, text: codeLines.join('\n') })
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
