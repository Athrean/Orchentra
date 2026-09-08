export type ParseFrontmatterResult =
  { kind: 'ok'; meta: Record<string, unknown>; body: string } | { kind: 'error'; message: string }

const FENCE = '---'

/** `>`, `|`, and their chomping/indent variants (`>-`, `|+`, `>2`). */
const BLOCK_INDICATOR = /^[|>][-+]?\d*$/

/**
 * Minimal YAML-frontmatter reader — enough of the spec that real SKILL.md
 * files parse, and no more.
 *
 * The one-line-per-key version this replaces could not read the frontmatter
 * that almost every published skill actually uses: a folded `description: >`
 * whose text continues on indented lines below. Those continuation lines were
 * rejected outright (`invalid frontmatter line`) when they had no colon, and
 * silently became bogus keys when they did — so a user's globally installed
 * skills all failed to load with a parse error pointing at prose.
 *
 * Supported: plain scalars, inline `[a, b]` arrays, block sequences (`- x`),
 * folded (`>`) and literal (`|`) block scalars, and implicit multi-line plain
 * scalars. Not supported (and not needed here): anchors, nested mappings,
 * flow mappings, typed tags.
 */
export function parseFrontmatter(input: string): ParseFrontmatterResult {
  const lines = input.split('\n')
  if (lines[0]?.trim() !== FENCE) {
    return { kind: 'error', message: 'missing opening --- fence' }
  }

  const closeIdx = lines.findIndex((line, i) => i > 0 && line.trim() === FENCE)
  if (closeIdx === -1) {
    return { kind: 'error', message: 'missing closing --- fence' }
  }

  const metaLines = lines.slice(1, closeIdx)
  const body = lines.slice(closeIdx + 1).join('\n')

  const meta: Record<string, unknown> = {}
  for (let i = 0; i < metaLines.length; i++) {
    const line = metaLines[i]!
    if (line.trim().length === 0) continue
    const indent = indentOf(line)
    const colon = line.indexOf(':')
    if (colon === -1) {
      return { kind: 'error', message: `invalid frontmatter line: '${line}'` }
    }
    const key = line.slice(0, colon).trim()
    const rawValue = line.slice(colon + 1).trim()

    // Everything indented deeper than the key belongs to the key. This is
    // also what stops a colon inside prose from being read as a new key.
    const block: string[] = []
    while (i + 1 < metaLines.length) {
      const next = metaLines[i + 1]!
      if (next.trim().length > 0 && indentOf(next) <= indent) break
      block.push(next.trim())
      i += 1
    }

    meta[key] = block.length > 0 ? parseBlockValue(rawValue, block) : parseScalarOrArray(rawValue)
  }

  return { kind: 'ok', meta, body }
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

function parseBlockValue(rawValue: string, block: readonly string[]): unknown {
  const lines = trimTrailingBlanks(block)
  if (lines.length === 0) return parseScalarOrArray(rawValue)

  // A block sequence under a bare key: `allowed-tools:` then `- Bash(...)`.
  if (rawValue.length === 0 && lines.every((l) => l.length === 0 || l.startsWith('- '))) {
    return lines.filter((l) => l.length > 0).map((l) => unquote(l.slice(2).trim()))
  }

  // A `>`/`|` indicator is syntax, not content; a plain value on the key line
  // is the first line of a multi-line scalar.
  const isIndicator = BLOCK_INDICATOR.test(rawValue)
  const all = isIndicator || rawValue.length === 0 ? [...lines] : [rawValue, ...lines]

  if (rawValue.startsWith('|')) return all.join('\n')

  // Folded: a blank line starts a new paragraph, everything else joins with a
  // space — which is what makes a folded description read as one sentence.
  const paragraphs: string[] = []
  let current = ''
  for (const line of all) {
    if (line.length === 0) {
      if (current) paragraphs.push(current)
      current = ''
      continue
    }
    current = current ? `${current} ${line}` : line
  }
  if (current) paragraphs.push(current)
  return paragraphs.join('\n\n')
}

function trimTrailingBlanks(lines: readonly string[]): string[] {
  const out = [...lines]
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

function parseScalarOrArray(value: string): unknown {
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    if (inner.length === 0) return []
    return inner.split(',').map((item) => unquote(item.trim()))
  }
  return unquote(value)
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    if ((first === '"' || first === "'") && value.endsWith(first)) return value.slice(1, -1)
  }
  return value
}
