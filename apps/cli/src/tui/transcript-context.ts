import type { TranscriptRow } from './types'

const MAX_TRANSCRIPT_ROWS = 12
const MAX_TRANSCRIPT_CHARS = 6000

export function planNeedFromTranscript(rows: readonly TranscriptRow[]): string | null {
  const parts: string[] = []
  let sawUserNeed = false

  for (let i = rows.length - 1; i >= 0 && parts.length < MAX_TRANSCRIPT_ROWS; i--) {
    const row = rows[i]
    const part = planContextPart(row)
    if (!part) continue
    if (row.kind === 'user') sawUserNeed = true
    parts.push(part)
  }

  if (!sawUserNeed) return null

  const body = parts.reverse().join('\n')
  const compact =
    body.length > MAX_TRANSCRIPT_CHARS ? `...truncated...\n${body.slice(body.length - MAX_TRANSCRIPT_CHARS)}` : body
  return `Recent transcript context:\n${compact}\n\nPlan the user need implied by this context.`
}

function planContextPart(row: TranscriptRow): string | null {
  if (row.kind === 'user') {
    const text = row.text.trim()
    if (text.length === 0 || text.startsWith('/') || text.startsWith('!')) return null
    return `User: ${text}`
  }

  if (row.kind === 'assistant') {
    const text = row.text.trim()
    if (text.length === 0) return null
    return `Assistant: ${text}`
  }

  return null
}
