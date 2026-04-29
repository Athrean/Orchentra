import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// Persist a marker the first time a user successfully launches the REPL so
// we only show the welcome tips once. The path matches credentials.json so
// users only have one orchentra directory to know about.
function markerPath(home: string = homedir()): string {
  return join(home, '.config', 'orchentra', '.welcomed')
}

export function isFirstRun(home: string = homedir()): boolean {
  return !existsSync(markerPath(home))
}

export function markWelcomed(home: string = homedir()): void {
  const path = markerPath(home)
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${new Date().toISOString()}\n`, { flag: 'w' })
  } catch {
    // Non-fatal — worst case we show tips again next launch.
  }
}
