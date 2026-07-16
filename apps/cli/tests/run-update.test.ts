import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runUpdate, type UpdateSpawn } from '../src/commands/run-update'

describe('runUpdate', () => {
  test('dry-run prints the npm command without spawning', () => {
    const writes: string[] = []
    let called = false
    const spawn: UpdateSpawn = () => {
      called = true
      return { status: 0 }
    }

    const status = runUpdate({
      dryRun: true,
      tag: 'latest',
      spawn,
      stdout: { write: (chunk) => writes.push(chunk) },
    })

    expect(status).toBe(0)
    expect(called).toBe(false)
    expect(writes.join('')).toBe('would run: npm install -g @athreanlab/orchentra@latest\n')
  })

  test('runs npm install without shell interpolation', () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const spawn: UpdateSpawn = (command, args) => {
      calls.push({ command, args })
      return { status: 0 }
    }

    const status = runUpdate({ dryRun: false, tag: 'alpha', spawn })

    expect(status).toBe(0)
    expect(calls).toEqual([{ command: 'npm', args: ['install', '-g', '@athreanlab/orchentra@alpha'] }])
  })

  test('installs the package name this CLI actually publishes under', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')) as { name: string }
    const writes: string[] = []

    runUpdate({ dryRun: true, tag: 'latest', stdout: { write: (chunk) => writes.push(chunk) } })

    expect(writes.join('')).toContain(` ${pkg.name}@latest`)
  })

  test('propagates npm failure status', () => {
    const writes: string[] = []
    const spawn: UpdateSpawn = () => ({ status: 7, error: new Error('boom') })

    const status = runUpdate({
      dryRun: false,
      tag: 'beta',
      spawn,
      stderr: { write: (chunk) => writes.push(chunk) },
    })

    expect(status).toBe(7)
    expect(writes.join('')).toContain('update failed: boom')
  })
})
