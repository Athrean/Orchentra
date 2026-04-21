const MAX_LOG_LINES_PER_JOB = 200

export function tailFailingLog(logs: string, maxLines: number = MAX_LOG_LINES_PER_JOB): string {
  const lines = logs.split(/\r?\n/)
  if (lines.length <= maxLines) return logs

  const errorAnchor = findLastErrorAnchor(lines)
  if (errorAnchor !== null) {
    const postAnchor = Math.min(40, lines.length - 1 - errorAnchor)
    const preAnchor = maxLines - 1 - postAnchor
    const start = Math.max(0, errorAnchor - preAnchor)
    const end = Math.min(lines.length, start + maxLines)
    return lines.slice(start, end).join('\n')
  }
  return lines.slice(-maxLines).join('\n')
}

function findLastErrorAnchor(lines: string[]): number | null {
  const markers = ['##[error]', 'error:', 'failed:', 'fatal:', 'exit code', 'traceback']
  for (let i = lines.length - 1; i >= 0; i--) {
    const lower = lines[i].toLowerCase()
    if (markers.some((m) => lower.includes(m))) return i
  }
  return null
}
