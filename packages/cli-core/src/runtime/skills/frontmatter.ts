export type ParseFrontmatterResult =
  | { kind: 'ok'; meta: Record<string, unknown>; body: string }
  | { kind: 'error'; message: string }

const FENCE = '---'

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
  for (const line of metaLines) {
    if (line.trim().length === 0) continue
    const colon = line.indexOf(':')
    if (colon === -1) {
      return { kind: 'error', message: `invalid frontmatter line: '${line}'` }
    }
    const key = line.slice(0, colon).trim()
    const rawValue = line.slice(colon + 1).trim()
    meta[key] = parseScalarOrArray(rawValue)
  }

  return { kind: 'ok', meta, body }
}

function parseScalarOrArray(value: string): unknown {
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    if (inner.length === 0) return []
    return inner.split(',').map((item) => item.trim())
  }
  return value
}
