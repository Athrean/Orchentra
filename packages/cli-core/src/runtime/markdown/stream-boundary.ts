interface FenceMarker {
  char: '`' | '~'
  length: number
}

/**
 * Buffers streamed markdown deltas and only releases text at safe boundaries
 * — paragraph breaks outside any open code fence, or right after a closed
 * fence. Prevents callers from rendering half-open fences or other partial-
 * token markup.
 */
export class MarkdownStreamState {
  private pending = ''

  push(delta: string): string | null {
    this.pending += delta
    const split = findStreamSafeBoundary(this.pending)
    if (split === null) return null
    const ready = this.pending.slice(0, split)
    this.pending = this.pending.slice(split)
    return ready
  }

  flush(): string | null {
    if (this.pending.trim().length === 0) {
      this.pending = ''
      return null
    }
    const out = this.pending
    this.pending = ''
    return out
  }
}

export function findStreamSafeBoundary(markdown: string): number | null {
  let lastBoundary: number | null = null
  let openFence: FenceMarker | null = null
  let cursor = 0

  for (const line of splitInclusiveNewline(markdown)) {
    const text = stripTrailingNewline(line)

    if (openFence) {
      if (lineClosesFence(text, openFence)) {
        openFence = null
        lastBoundary = cursor + line.length
      }
      cursor += line.length
      continue
    }

    const opener = parseFenceOpener(text)
    if (opener) {
      openFence = opener
      cursor += line.length
      continue
    }

    if (text.trim().length === 0) {
      lastBoundary = cursor + line.length
    }
    cursor += line.length
  }

  return lastBoundary
}

function parseFenceOpener(line: string): FenceMarker | null {
  const indent = leadingSpaces(line)
  if (indent > 3) return null
  const rest = line.slice(indent)
  const ch = rest[0]
  if (ch !== '`' && ch !== '~') return null
  const length = countLeading(rest, ch)
  if (length < 3) return null
  const info = rest.slice(length)
  // For backtick fences the info string must not contain another backtick.
  if (ch === '`' && info.includes('`')) return null
  return { char: ch, length }
}

function lineClosesFence(line: string, opener: FenceMarker): boolean {
  const indent = leadingSpaces(line)
  if (indent > 3) return false
  const rest = line.slice(indent)
  const length = countLeading(rest, opener.char)
  if (length < opener.length) return false
  // Everything after the closing run must be whitespace.
  for (let i = length; i < rest.length; i++) {
    const c = rest[i]
    if (c !== ' ' && c !== '\t') return false
  }
  return true
}

function leadingSpaces(line: string): number {
  let n = 0
  while (n < line.length && line[n] === ' ') n++
  return n
}

function countLeading(input: string, ch: string): number {
  let n = 0
  while (n < input.length && input[n] === ch) n++
  return n
}

function splitInclusiveNewline(input: string): string[] {
  if (input.length === 0) return []
  const out: string[] = []
  let start = 0
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '\n') {
      out.push(input.slice(start, i + 1))
      start = i + 1
    }
  }
  if (start < input.length) {
    out.push(input.slice(start))
  }
  return out
}

function stripTrailingNewline(line: string): string {
  return line.endsWith('\n') ? line.slice(0, -1) : line
}
