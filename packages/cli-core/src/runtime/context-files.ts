import type { ChatMessage } from './provider'

export interface ContextFile {
  readonly path: string
  /** Times this path was pulled in with read_file across the conversation. */
  readonly reads: number
}

/**
 * Distinct files loaded into context via `read_file`, so `/context` can show
 * *what* is filling the window, not just the token total. Sorted most-read
 * first (a re-read reloads content already in context), ties broken by path.
 */
export function collectContextFiles(messages: readonly ChatMessage[]): ContextFile[] {
  const counts = new Map<string, number>()
  for (const msg of messages) {
    for (const call of msg.toolCalls ?? []) {
      if (call.name !== 'read_file') continue
      const path = readPath(call.input)
      if (path === null) continue
      counts.set(path, (counts.get(path) ?? 0) + 1)
    }
  }
  const files: ContextFile[] = []
  counts.forEach((reads, path) => files.push({ path, reads }))
  return files.sort((a, b) => b.reads - a.reads || a.path.localeCompare(b.path))
}

function readPath(input: unknown): string | null {
  if (input === null || typeof input !== 'object') return null
  const path = (input as { path?: unknown }).path
  return typeof path === 'string' && path.length > 0 ? path : null
}
