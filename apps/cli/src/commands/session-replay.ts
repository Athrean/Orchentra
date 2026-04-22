import { resolveSessionPath, replaySession, defaultSessionDir } from '@orchentra/cli-core'

export interface SessionReplayOptions {
  readonly idOrLatest: string
  readonly rootDir?: string
  readonly out?: (line: string) => void
  readonly err?: (line: string) => void
}

export async function runSessionReplay(options: SessionReplayOptions): Promise<number> {
  const rootDir = options.rootDir ?? defaultSessionDir()
  const out =
    options.out ??
    ((line: string): void => {
      process.stdout.write(line + '\n')
    })
  const err =
    options.err ??
    ((line: string): void => {
      process.stderr.write(line + '\n')
    })

  let path: string
  try {
    path = await resolveSessionPath(options.idOrLatest, rootDir)
  } catch (e) {
    err(`session replay: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }

  let records
  try {
    records = await replaySession(path)
  } catch (e) {
    err(`session replay: cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }

  for (const record of records) {
    out(JSON.stringify(record.event))
  }
  return 0
}
