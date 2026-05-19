/**
 * Pre-process markdown so fences containing inner fences of equal length
 * stay closed by the correct delimiter.
 *
 * LLMs frequently emit code blocks that themselves contain triple-backtick
 * sequences ("here is markdown showing markdown"). With a naive
 * 3-backtick lexer the first inner fence closes the outer block early
 * and the rest of the document corrupts. CommonMark's rule is that a
 * fence is closed by a run of the same character of *at least* the
 * opening length, so the fix is to bump the outer fence to one longer
 * than the longest inner fence of the same character.
 *
 * Backtick and tilde fences are processed independently — content
 * inside one kind is opaque to the other.
 *
 * Heuristic for distinguishing opener vs closer (necessary because we
 * don't have a real CommonMark stack at hand): a line whose only
 * non-whitespace content is the fence run is a BARE_CLOSE; a line with
 * anything else after the run (language tag, attributes) is an OPEN.
 * The pairing uses a stack and walks top-down.
 */

const FENCE_CHARS = ['`', '~'] as const
type FenceChar = (typeof FENCE_CHARS)[number]

interface FenceLine {
  readonly idx: number
  readonly run: number
  readonly isBareClose: boolean
}

function leadingRun(line: string, ch: FenceChar): number {
  let n = 0
  while (n < line.length && line[n] === ch) n++
  return n
}

function classifyFence(line: string, ch: FenceChar): FenceLine | null {
  const run = leadingRun(line, ch)
  if (run < 3) return null
  const rest = line.slice(run)
  const isBareClose = rest.trim().length === 0
  return { idx: -1, run, isBareClose }
}

export function normalizeNestedFences(input: string): string {
  let out = input
  for (const ch of FENCE_CHARS) {
    out = normalizeForChar(out, ch)
  }
  return out
}

interface Upgrade {
  readonly openIdx: number
  readonly closeIdx: number | null
  readonly addPad: number
}

function normalizeForChar(input: string, ch: FenceChar): string {
  const lines = input.split('\n')
  // Collect every fence line for this char.
  const fences: FenceLine[] = []
  for (let i = 0; i < lines.length; i++) {
    const f = classifyFence(lines[i], ch)
    if (f) fences.push({ idx: i, run: f.run, isBareClose: f.isBareClose })
  }
  if (fences.length === 0) return input

  // Pair openers and closers via a stack. Each opener gets the FIRST
  // subsequent bare-close with run >= opener.run as its closer.
  const stack: FenceLine[] = []
  const pairs = new Map<number, number | null>() // openIdx -> closeIdx | null
  for (const f of fences) {
    if (f.isBareClose && stack.length > 0) {
      // Pop everything in the stack whose run <= f.run; the topmost match
      // is the one that pairs with this close.
      let matched: FenceLine | null = null
      // Find the innermost open with run <= f.run.
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].run <= f.run) {
          matched = stack[k]
          // Treat any opens above it as still open (unusual but safe).
          stack.splice(k, 1)
          break
        }
      }
      if (matched) {
        pairs.set(matched.idx, f.idx)
      }
      continue
    }
    // Open (has language tag, or no opener on stack to match a bare).
    stack.push(f)
    pairs.set(f.idx, null)
  }

  // For each opener, decide if it needs an upgrade. An opener at depth 0
  // (outermost) needs an upgrade if any other fence line between
  // open.idx and close.idx (exclusive of the close) has run >= open.run.
  const upgrades: Upgrade[] = []
  pairs.forEach((closeIdx, openIdx) => {
    const openLine = fences.find((f) => f.idx === openIdx)
    if (!openLine) return
    // Look for any fence inside [open+1, close-1] (or [open+1, EOF-1]
    // for an unclosed streaming block) whose run >= openLine.run.
    let maxInner = 0
    for (const f of fences) {
      if (f.idx <= openIdx) continue
      if (closeIdx !== null && f.idx >= closeIdx) continue
      if (f.run >= openLine.run && f.run > maxInner) maxInner = f.run
    }
    if (maxInner >= openLine.run) {
      const addPad = maxInner - openLine.run + 1
      upgrades.push({ openIdx, closeIdx, addPad })
    }
  })

  if (upgrades.length === 0) return input

  // Apply upgrades: pad both open and close (if any) with extra fence
  // chars at the start of the line.
  const out = lines.slice()
  for (const u of upgrades) {
    const pad = ch.repeat(u.addPad)
    out[u.openIdx] = pad + out[u.openIdx]
    if (u.closeIdx !== null) {
      out[u.closeIdx] = pad + out[u.closeIdx]
    }
  }
  return out.join('\n')
}
