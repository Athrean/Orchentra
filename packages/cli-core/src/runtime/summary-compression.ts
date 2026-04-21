const DEFAULT_MAX_CHARS = 1200
const DEFAULT_MAX_LINES = 24
const DEFAULT_MAX_LINE_CHARS = 160

export interface SummaryCompressionBudget {
  maxChars: number
  maxLines: number
  maxLineChars: number
}

export interface SummaryCompressionResult {
  summary: string
  originalChars: number
  compressedChars: number
  originalLines: number
  compressedLines: number
  removedDuplicateLines: number
  omittedLines: number
  truncated: boolean
}

export const defaultCompressionBudget: SummaryCompressionBudget = {
  maxChars: DEFAULT_MAX_CHARS,
  maxLines: DEFAULT_MAX_LINES,
  maxLineChars: DEFAULT_MAX_LINE_CHARS,
}

export function compressSummary(summary: string, budget: SummaryCompressionBudget): SummaryCompressionResult {
  const originalChars = charLen(summary)
  const originalLines = summary.split('\n').length

  const normalized = normalizeLines(summary, budget.maxLineChars)

  if (normalized.lines.length === 0 || budget.maxChars === 0 || budget.maxLines === 0) {
    return {
      summary: '',
      originalChars,
      compressedChars: 0,
      originalLines,
      compressedLines: 0,
      removedDuplicateLines: normalized.removedDuplicateLines,
      omittedLines: normalized.lines.length,
      truncated: originalChars > 0,
    }
  }

  const selected = selectLineIndexes(normalized.lines, budget)
  const compressedLines: string[] = selected.map((i) => normalized.lines[i])

  if (compressedLines.length === 0) {
    compressedLines.push(truncateLine(normalized.lines[0], budget.maxChars))
  }

  const omittedCount = normalized.lines.length - compressedLines.length
  if (omittedCount > 0) {
    pushLineWithBudget(compressedLines, omissionNotice(omittedCount), budget)
  }

  const compressedSummary = compressedLines.join('\n')

  return {
    summary: compressedSummary,
    originalChars,
    compressedChars: charLen(compressedSummary),
    originalLines,
    compressedLines: compressedLines.length,
    removedDuplicateLines: normalized.removedDuplicateLines,
    omittedLines: omittedCount,
    truncated: compressedSummary !== summary.trim(),
  }
}

export function compressSummaryText(summary: string): string {
  return compressSummary(summary, defaultCompressionBudget).summary
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function charLen(s: string): number {
  return Array.from(s).length
}

interface NormalizedSummary {
  lines: string[]
  removedDuplicateLines: number
}

function normalizeLines(summary: string, maxLineChars: number): NormalizedSummary {
  const seen = new Set<string>()
  const lines: string[] = []
  let removedDuplicateLines = 0

  for (const rawLine of summary.split('\n')) {
    const collapsed = collapseInlineWhitespace(rawLine)
    if (collapsed.length === 0) continue

    const truncated = truncateLine(collapsed, maxLineChars)
    const key = dedupeKey(truncated)

    if (seen.has(key)) {
      removedDuplicateLines += 1
      continue
    }
    seen.add(key)
    lines.push(truncated)
  }

  return { lines, removedDuplicateLines }
}

function selectLineIndexes(lines: string[], budget: SummaryCompressionBudget): number[] {
  const selected = new Set<number>()

  for (let priority = 0; priority <= 3; priority++) {
    for (let index = 0; index < lines.length; index++) {
      if (selected.has(index) || linePriority(lines[index]) !== priority) continue

      const candidate: string[] = Array.from(selected)
        .sort()
        .map((si) => lines[si])
        .concat(lines[index])

      if (candidate.length > budget.maxLines) continue
      if (joinedCharCount(candidate) > budget.maxChars) continue

      selected.add(index)
    }
  }

  return Array.from(selected).sort()
}

function pushLineWithBudget(lines: string[], line: string, budget: SummaryCompressionBudget): void {
  const candidate = lines.concat(line)

  if (candidate.length <= budget.maxLines && joinedCharCount(candidate) <= budget.maxChars) {
    lines.push(line)
  }
}

function joinedCharCount(lines: string[]): number {
  let total = 0
  for (const line of lines) {
    total += charLen(line)
  }
  return total + Math.max(lines.length - 1, 0)
}

function linePriority(line: string): number {
  if (line === 'Summary:' || line === 'Conversation summary:' || isCoreDetail(line)) return 0
  if (isSectionHeader(line)) return 1
  if (line.startsWith('- ') || line.startsWith('  - ')) return 2
  return 3
}

const CORE_DETAIL_PREFIXES: readonly string[] = [
  '- Scope:',
  '- Current work:',
  '- Pending work:',
  '- Key files referenced:',
  '- Tools mentioned:',
  '- Recent user requests:',
  '- Previously compacted context:',
  '- Newly compacted context:',
]

function isCoreDetail(line: string): boolean {
  return CORE_DETAIL_PREFIXES.some((prefix) => line.startsWith(prefix))
}

function isSectionHeader(line: string): boolean {
  return line.endsWith(':')
}

function omissionNotice(count: number): string {
  return `- … ${count} additional line(s) omitted.`
}

function collapseInlineWhitespace(line: string): string {
  return line.split(/\s+/).join(' ').trim()
}

function truncateLine(line: string, maxChars: number): string {
  const count = charLen(line)
  if (maxChars === 0 || count <= maxChars) return line
  if (maxChars === 1) return '…'
  return (
    Array.from(line)
      .slice(0, maxChars - 1)
      .join('') + '…'
  )
}

function dedupeKey(line: string): string {
  return line.toLowerCase()
}
