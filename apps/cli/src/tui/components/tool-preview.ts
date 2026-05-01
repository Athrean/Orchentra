export interface PreviewOptions {
  readonly maxLines: number
  readonly maxChars: number
  /** When true, return every line and ignore the caps. Used by ctrl+o expand. */
  readonly full?: boolean
}

export interface PreviewResult {
  readonly lines: string[]
  readonly truncated: boolean
  readonly hiddenLines: number
}

// Tools currently return their result as a single JSON string (e.g.
// `JSON.stringify({totalCount, items})`). Without pretty-printing, that string
// has no `\n`, so any line-based truncation degenerates into one giant wrapped
// row in the terminal. Pretty-print structured payloads first so the line
// budget actually applies.
export function prettyPrintIfJson(text: string): string {
  if (text.length === 0) return text
  const head = text.trimStart()[0]
  if (head !== '{' && head !== '[') return text
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed === null || typeof parsed !== 'object') return text
    return JSON.stringify(parsed, null, 2)
  } catch {
    return text
  }
}

export function previewToolResult(text: string, opts: PreviewOptions): PreviewResult {
  const pretty = prettyPrintIfJson(text)
  const all = pretty.split('\n').map((l) => l.replace(/\s+$/, ''))
  while (all.length > 0 && all[all.length - 1] === '') all.pop()

  if (all.length === 0) return { lines: [''], truncated: false, hiddenLines: 0 }
  if (opts.full) return { lines: all, truncated: false, hiddenLines: 0 }

  const out: string[] = []
  let used = 0
  let truncated = false
  for (let i = 0; i < all.length; i++) {
    if (i >= opts.maxLines) {
      truncated = true
      break
    }
    const line = all[i] ?? ''
    const newlineCost = out.length === 0 ? 0 : 1
    const room = opts.maxChars - used - newlineCost
    if (room <= 0) {
      truncated = true
      break
    }
    if (line.length > room) {
      out.push(line.slice(0, room))
      truncated = true
      break
    }
    out.push(line)
    used += newlineCost + line.length
  }

  const hidden = truncated ? Math.max(0, all.length - out.length) : 0
  return { lines: out, truncated, hiddenLines: hidden }
}
