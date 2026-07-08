import { randomBytes } from 'node:crypto'

/**
 * Heuristic paste detector. The terminal/Ink doesn't tell us "this was a
 * paste" reliably across platforms, so we infer it: when many characters
 * arrive in a single tick and the result has a newline (or is huge), treat
 * it as a paste and substitute a chip placeholder.
 */
export interface PasteDecision {
  readonly isPaste: boolean
  readonly chipMarker: string
  readonly chipId: string
  readonly content: string
  readonly lines: number
}

const MIN_PASTE_CHARS = 200
// Any embedded newline marks a paste/drag: shift+enter newlines are inserted
// by the return-key branch and never flow through here, so a newline inside a
// printable burst can only come from pasted or drag-dropped text.
const MIN_PASTE_LINES = 2

export function evaluatePaste(input: string): PasteDecision | null {
  // Terminals translate LF to CR when pasting/dragging; a bare \r reaching the
  // buffer overwrites the rendered row and deforms the input box, so normalize
  // every CR/CRLF to LF before measuring or storing the content.
  const content = input.replace(/\r\n?/g, '\n')
  const lines = countLines(content)
  if (content.length < MIN_PASTE_CHARS && lines < MIN_PASTE_LINES) return null
  const id = randomBytes(3).toString('hex')
  const marker = `[Pasted #${id} — ${lines} lines]`
  return { isPaste: true, chipMarker: marker, chipId: id, content, lines }
}

function countLines(text: string): number {
  let n = 1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') n += 1
  }
  return n
}

/**
 * Expand all paste chip markers in `text` back to their full content using
 * the provided registry. Markers without a matching registry entry are left
 * as-is (treated as user-typed text).
 */
export function expandPastes(text: string, registry: Readonly<Record<string, { content: string }>>): string {
  return text.replace(/\[Pasted #([a-z0-9]+) — \d+ lines]/g, (match, id: string) => {
    const entry = registry[id]
    return entry ? entry.content : match
  })
}
