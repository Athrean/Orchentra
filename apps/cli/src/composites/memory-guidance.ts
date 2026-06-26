import type { MemoryStore, PatternEntry } from '@orchentra/cli-core'

export interface MemoryFeedbackGuidanceOptions {
  readonly maxPerKind?: number
  readonly maxSnippetChars?: number
}

type FeedbackKind = 'accepted' | 'rejected'

const DEFAULT_MAX_PER_KIND = 3
const DEFAULT_MAX_SNIPPET_CHARS = 180

export function loadMemoryFeedbackGuidance(
  store: MemoryStore,
  orgId: string = 'default',
  opts: MemoryFeedbackGuidanceOptions = {},
): string {
  try {
    return formatMemoryFeedbackGuidance(store.load(orgId), opts)
  } catch {
    return ''
  }
}

export function formatMemoryFeedbackGuidance(
  entries: readonly PatternEntry[],
  opts: MemoryFeedbackGuidanceOptions = {},
): string {
  const maxPerKind = opts.maxPerKind ?? DEFAULT_MAX_PER_KIND
  const maxSnippetChars = opts.maxSnippetChars ?? DEFAULT_MAX_SNIPPET_CHARS
  const accepted = select(entries, 'accepted', maxPerKind)
  const rejected = select(entries, 'rejected', maxPerKind)
  if (accepted.length === 0 && rejected.length === 0) return ''

  const lines = ['## Local Feedback Memory', 'Use accepted patterns as guidance. Avoid repeating rejected patterns.']

  if (accepted.length > 0) {
    lines.push('', 'Accepted patterns:')
    for (const entry of accepted) lines.push(formatEntry(entry, maxSnippetChars))
  }

  if (rejected.length > 0) {
    lines.push('', 'Rejected patterns:')
    for (const entry of rejected) lines.push(formatEntry(entry, maxSnippetChars))
  }

  return lines.join('\n')
}

function select(entries: readonly PatternEntry[], feedback: FeedbackKind, max: number): PatternEntry[] {
  return entries
    .filter((entry) => entry.feedback === feedback)
    .slice()
    .sort((a, b) => timestamp(b) - timestamp(a))
    .slice(0, max)
}

function timestamp(entry: PatternEntry): number {
  return Date.parse(entry.feedbackAt ?? entry.createdAt) || 0
}

function formatEntry(entry: PatternEntry, maxSnippetChars: number): string {
  return `- ${snippet(entry.pattern, maxSnippetChars)} -> ${snippet(entry.resolution, maxSnippetChars)}`
}

function snippet(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, Math.max(0, max - 1))}...` : flat
}
