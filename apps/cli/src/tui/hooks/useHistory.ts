import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const HISTORY_DIR = join(homedir(), '.orchentra')
const HISTORY_FILE = join(HISTORY_DIR, 'history')
const MAX_LINES = 5000

export async function loadHistory(): Promise<string[]> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf8')
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    return lines.slice(-MAX_LINES)
  } catch {
    return []
  }
}

export async function appendHistory(entry: string): Promise<void> {
  const trimmed = entry.trim()
  if (trimmed.length === 0) return
  try {
    await fs.mkdir(dirname(HISTORY_FILE), { recursive: true })
    await fs.appendFile(HISTORY_FILE, `${trimmed}\n`, 'utf8')
  } catch {
    // History persistence is best-effort.
  }
}
