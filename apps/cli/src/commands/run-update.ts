import { spawnSync } from 'node:child_process'
import type { UpdateTag } from '../args'

export interface UpdateOptions {
  readonly dryRun: boolean
  readonly tag: UpdateTag
  readonly spawn?: UpdateSpawn
  readonly stdout?: WritableSink
  readonly stderr?: WritableSink
}

export type UpdateSpawn = (command: string, args: string[]) => UpdateSpawnResult

export interface UpdateSpawnResult {
  readonly status: number | null
  readonly error?: Error
}

interface WritableSink {
  write(chunk: string): void
}

const PACKAGE_NAME = '@athreanlab/orchentra'

export function runUpdate(opts: UpdateOptions): number {
  const spec = `${PACKAGE_NAME}@${opts.tag}`
  const args = ['install', '-g', spec]
  const commandText = `npm ${args.join(' ')}`

  if (opts.dryRun) {
    ;(opts.stdout ?? process.stdout).write(`would run: ${commandText}\n`)
    return 0
  }

  const result = (opts.spawn ?? defaultSpawn)('npm', args)
  if (result.status === 0) return 0

  const detail = result.error ? `: ${result.error.message}` : ''
  ;(opts.stderr ?? process.stderr).write(`update failed${detail}\n`)
  return result.status ?? 1
}

function defaultSpawn(command: string, args: string[]): UpdateSpawnResult {
  return spawnSync(command, args, { stdio: 'inherit' })
}
