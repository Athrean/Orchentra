import type { TranscriptRow } from '../types'

export function transcriptText(rows: readonly TranscriptRow[]): string | null {
  const lines: string[] = []
  for (const row of rows) {
    switch (row.kind) {
      case 'user':
        lines.push(`User: ${row.text}`)
        break
      case 'assistant':
        lines.push(`Assistant: ${row.text}`)
        break
      case 'system':
        lines.push(`System: ${row.text}`)
        break
      case 'error':
        lines.push(`Error: ${row.message}`)
        break
      case 'tool_call':
        lines.push(`Tool ${row.name}: ${row.input}`)
        break
      case 'tool_result':
        lines.push(`Tool result${row.name ? ` ${row.name}` : ''}: ${row.preview}`)
        break
      case 'stream':
        lines.push(`${row.label ?? 'Stream'}: ${row.text}`)
        break
      case 'reasoning':
        if (row.text.trim()) lines.push(`Reasoning: ${row.text}`)
        break
      case 'done':
        lines.push(`Done: ${row.steps} steps, ${row.usage.inputTokens + row.usage.outputTokens} tokens`)
        break
      case 'compacted':
        lines.push(`Compacted: dropped ${row.dropped}, saved ${row.saved}`)
        break
      case 'card':
        lines.push([row.title, row.subtitle].filter(Boolean).join(' - '))
        for (const section of row.sections) {
          if (section.title) lines.push(section.title)
          for (const r of section.rows) lines.push(`${r.key}: ${r.value}`)
        }
        break
    }
  }
  const out = lines.join('\n').trim()
  return out.length === 0 ? null : out
}
