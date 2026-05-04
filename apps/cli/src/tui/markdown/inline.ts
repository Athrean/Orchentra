// Tokenises inline-markdown so a TUI renderer can decide how to style each
// span. Supports backtick code, **bold**, *italic*, _italic_, and
// [text](url) links. Nested or overlapping styles are treated as plain text —
// keeping this lossy is preferable to a half-correct full CommonMark parser.

export type InlineToken =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'code'; readonly value: string }
  | { readonly kind: 'bold'; readonly value: string }
  | { readonly kind: 'italic'; readonly value: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string }

export function tokenizeInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let i = 0
  let buf = ''

  const flush = (): void => {
    if (buf.length > 0) {
      tokens.push({ kind: 'text', value: buf })
      buf = ''
    }
  }

  while (i < input.length) {
    const ch = input[i]

    // Inline code: `...`
    if (ch === '`') {
      const end = input.indexOf('`', i + 1)
      if (end !== -1) {
        flush()
        tokens.push({ kind: 'code', value: input.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }

    // Link: [text](href)
    if (ch === '[') {
      const closeText = input.indexOf(']', i + 1)
      if (closeText !== -1 && input[closeText + 1] === '(') {
        const closeHref = input.indexOf(')', closeText + 2)
        if (closeHref !== -1) {
          flush()
          tokens.push({
            kind: 'link',
            text: input.slice(i + 1, closeText),
            href: input.slice(closeText + 2, closeHref),
          })
          i = closeHref + 1
          continue
        }
      }
    }

    // Bold: **...**
    if (ch === '*' && input[i + 1] === '*') {
      const end = input.indexOf('**', i + 2)
      if (end !== -1) {
        flush()
        tokens.push({ kind: 'bold', value: input.slice(i + 2, end) })
        i = end + 2
        continue
      }
    }

    // Italic: *...* or _..._  (single chars)
    if ((ch === '*' || ch === '_') && input[i + 1] !== ch) {
      const end = input.indexOf(ch, i + 1)
      // Avoid matching across whitespace boundaries that would collide with
      // emphasis markers used as plain punctuation.
      if (end !== -1 && end > i + 1 && !/\s/.test(input[i + 1])) {
        flush()
        tokens.push({ kind: 'italic', value: input.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }

    buf += ch
    i++
  }

  flush()
  return tokens
}
