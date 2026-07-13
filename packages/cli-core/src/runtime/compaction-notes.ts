import { mkdir, appendFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Durable compaction artifact: every compaction appends its summary to a
 * per-session NOTES.md, so what the model was told about dropped history
 * survives on disk instead of living only inside the context window. A run
 * that went sideways after compaction can be audited against what the
 * summary actually preserved.
 */

export function compactionNotesPath(cwd: string, sessionId: string): string {
  return join(cwd, '.orchentra', 'sessions', sessionId, 'NOTES.md')
}

export interface CompactionNoteInput {
  droppedCount: number
  tokensSaved: number
  summary: string
}

export function renderCompactionNote(timestamp: string, result: CompactionNoteInput): string {
  return [
    `## Compaction — ${timestamp}`,
    '',
    `- dropped ${result.droppedCount} message(s), ~${result.tokensSaved} tokens saved`,
    '',
    result.summary,
    '',
    '',
  ].join('\n')
}

export async function appendCompactionNote(path: string, note: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, note, 'utf8')
}
