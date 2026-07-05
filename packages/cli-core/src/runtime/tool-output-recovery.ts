import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

// Deterministic from ids alone so a caller can compute it before deciding
// whether a write is actually needed (only on trim, not on every tool call).
export function toolResultPath(cwd: string, sessionId: string, toolCallId: string): string {
  return join(cwd, '.orchentra', 'sessions', sessionId, 'tool-results', `${toolCallId}.txt`)
}

export async function persistOriginalToolOutput(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}
