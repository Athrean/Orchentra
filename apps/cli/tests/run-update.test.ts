import { describe, expect, test } from 'bun:test'
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
    expect(writes.join('')).toBe('would run: npm install -g @orchentra/cli@latest\n')
  })

  test('runs npm install without shell interpolation', () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const spawn: UpdateSpawn = (command, args) => {
      calls.push({ command, args })
      return { status: 0 }
    }

    const status = runUpdate({ dryRun: false, tag: 'alpha', spawn })

    expect(status).toBe(0)
    expect(calls).toEqual([{ command: 'npm', args: ['install', '-g', '@orchentra/cli@alpha'] }])
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
