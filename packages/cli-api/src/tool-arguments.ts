export interface ParseToolArgumentsResult {
  args: Record<string, unknown>
  recovered: boolean
  error?: string
}

export function parseToolArguments(raw: string | null | undefined, toolName: string): ParseToolArgumentsResult {
  const trimmed = (raw ?? '').trim()
  if (trimmed.length === 0) {
    return { args: {}, recovered: false }
  }

  const direct = tryParse(trimmed)
  if (direct !== undefined) return { args: direct, recovered: false }

  const stripped = stripCodeFence(trimmed)
  if (stripped !== null) {
    const parsed = tryParse(stripped)
    if (parsed !== undefined) return { args: parsed, recovered: true }
  }

  const trailing = stripTrailingCommas(trimmed)
  if (trailing !== null) {
    const parsed = tryParse(trailing)
    if (parsed !== undefined) return { args: parsed, recovered: true }
  }

  process.stderr.write(
    `[orchentra] warn: tool '${toolName}' returned unparseable arguments (${trimmed.slice(0, 200)}...). Falling back to {}.\n`,
  )
  return { args: {}, recovered: false, error: 'unparseable' }
}

function tryParse(text: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(text)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
  } catch {
    return undefined
  }
  return undefined
}

function stripCodeFence(text: string): string | null {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fenced) return fenced[1].trim()
  return null
}

function stripTrailingCommas(text: string): string | null {
  const cleaned = text.replace(/,(\s*[}\]])/g, '$1')
  return cleaned === text ? null : cleaned
}
