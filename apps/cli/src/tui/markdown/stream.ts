/**
 * Locate the last "stream-safe" boundary in a partial markdown stream.
 *
 * Streaming markdown into a renderer that treats unclosed fences as full
 * code blocks produces flicker: the half-typed code block is rendered as
 * a styled box, then re-rendered when the closing fence arrives. To
 * avoid that, the renderer can split the input at the safe boundary —
 * everything before the boundary is committed-shape markdown that will
 * not change, everything after is pending text that should render as
 * plain prose until the next safe block completes.
 *
 * Safe boundaries are the byte offsets right after:
 *   - a closed fenced code block (matching ``` or ~~~ line),
 *   - a blank line that terminates a paragraph / list / quote.
 *
 * If the trailing content is mid-fence (an opening fence without a
 * matching closer) or mid-paragraph (no trailing blank), the boundary
 * sits at the start of that pending region. Content inside an open
 * fence is treated as opaque — blank lines or fences of the other
 * char inside an open fence never advance the boundary.
 *
 * Returns `text.length` when the entire input is already safe.
 */

const BACKTICK_FENCE_RE = /^```/
const TILDE_FENCE_RE = /^~~~/

export function findStreamSafeBoundary(text: string): number {
  if (text.length === 0) return 0
  const lines = text.split('\n')
  let openFence: '`' | '~' | null = null
  let lastSafeLineIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (openFence === null) {
      if (BACKTICK_FENCE_RE.test(line)) {
        openFence = '`'
        continue
      }
      if (TILDE_FENCE_RE.test(line)) {
        openFence = '~'
        continue
      }
      if (line.trim().length === 0) {
        lastSafeLineIdx = i
      }
      continue
    }
    // Inside a fence; only a matching-char fence line closes it.
    if (openFence === '`' && BACKTICK_FENCE_RE.test(line)) {
      openFence = null
      lastSafeLineIdx = i
      continue
    }
    if (openFence === '~' && TILDE_FENCE_RE.test(line)) {
      openFence = null
      lastSafeLineIdx = i
      continue
    }
    // Otherwise opaque — including blank lines and fences of the other char.
  }
  if (lastSafeLineIdx === -1) return 0
  // Compute byte offset = sum of line lengths + the newlines through lastSafeLineIdx.
  let offset = 0
  for (let i = 0; i <= lastSafeLineIdx; i++) {
    offset += lines[i].length + 1
  }
  return Math.min(offset, text.length)
}

export interface StreamSplit {
  readonly safe: string
  readonly pending: string
}

export function splitAtStreamBoundary(text: string): StreamSplit {
  const cut = findStreamSafeBoundary(text)
  return { safe: text.slice(0, cut), pending: text.slice(cut) }
}
