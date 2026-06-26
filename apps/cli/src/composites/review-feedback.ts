import type { MemoryFeedback, MemoryStore, PatternEntry } from '@orchentra/cli-core'

export interface ReviewFeedbackComment {
  readonly id: string
  readonly body: string
  readonly url?: string
}

export interface ReviewFeedbackMarker {
  readonly memoryId: string
  readonly feedback: MemoryFeedback
  readonly source: string
}

export interface ReviewFeedbackApplyResult {
  readonly applied: readonly ReviewFeedbackMarker[]
  readonly missing: readonly ReviewFeedbackMarker[]
  readonly ambiguous: readonly (ReviewFeedbackMarker & { readonly matches: number })[]
  readonly ignored: readonly (ReviewFeedbackMarker & { readonly reason: 'unsupported-store' })[]
}

type Resolved = { kind: 'found'; entry: PatternEntry } | { kind: 'none' } | { kind: 'ambiguous'; count: number }

const MARKER_PATTERNS = [
  /^\s*orchentra\s+feedback:\s*([a-zA-Z0-9-]+)\s+(accepted|rejected)\b/i,
  /^\s*\/memory\s+mark\s+([a-zA-Z0-9-]+)\s+(accepted|rejected)\b/i,
]

export function parseReviewFeedbackComments(comments: readonly ReviewFeedbackComment[]): ReviewFeedbackMarker[] {
  const markers: ReviewFeedbackMarker[] = []
  for (const comment of comments) {
    for (const line of comment.body.split('\n')) {
      const parsed = parseFeedbackLine(line)
      if (parsed) {
        markers.push({
          ...parsed,
          source: comment.url ?? comment.id,
        })
      }
    }
  }
  return markers
}

export function applyReviewFeedback(
  store: MemoryStore,
  orgId: string,
  markers: readonly ReviewFeedbackMarker[],
  now: () => Date = () => new Date(),
): ReviewFeedbackApplyResult {
  if (!store.setFeedback) {
    return {
      applied: [],
      missing: [],
      ambiguous: [],
      ignored: markers.map((m) => ({ ...m, reason: 'unsupported-store' })),
    }
  }

  const entries = store.load(orgId)
  const applied: ReviewFeedbackMarker[] = []
  const missing: ReviewFeedbackMarker[] = []
  const ambiguous: (ReviewFeedbackMarker & { matches: number })[] = []

  for (const marker of markers) {
    const resolved = resolveByPrefix(entries, marker.memoryId)
    if (resolved.kind === 'none') missing.push(marker)
    else if (resolved.kind === 'ambiguous') ambiguous.push({ ...marker, matches: resolved.count })
    else {
      store.setFeedback(orgId, resolved.entry.id, marker.feedback, now())
      applied.push({ ...marker, memoryId: resolved.entry.id })
    }
  }

  return { applied, missing, ambiguous, ignored: [] }
}

function parseFeedbackLine(line: string): Omit<ReviewFeedbackMarker, 'source'> | null {
  for (const pattern of MARKER_PATTERNS) {
    const match = line.match(pattern)
    if (match) return { memoryId: match[1], feedback: match[2].toLowerCase() as MemoryFeedback }
  }
  return null
}

function resolveByPrefix(entries: readonly PatternEntry[], idArg: string): Resolved {
  const exact = entries.find((e) => e.id === idArg)
  if (exact) return { kind: 'found', entry: exact }
  const matches = entries.filter((e) => e.id.startsWith(idArg))
  if (matches.length === 0) return { kind: 'none' }
  if (matches.length > 1) return { kind: 'ambiguous', count: matches.length }
  return { kind: 'found', entry: matches[0] }
}
