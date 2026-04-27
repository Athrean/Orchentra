import { describe, expect, test } from 'bun:test'
import { RestartCommand } from '../src/commands/builtin/restart'
import type { CommandContext } from '../src/commands/registry'

const fakeSession = {} as CommandContext['session']

describe('RestartCommand', () => {
  test('spec shape exposes name + summary', () => {
    const cmd = new RestartCommand({ exec: () => {} })
    expect(cmd.spec.name).toBe('restart')
    expect(cmd.spec.summary.length).toBeGreaterThan(0)
  })

  test('execute() invokes the exec callback with the current argv tail', async () => {
    let captured: { execPath: string; argv: string[] } | null = null
    const cmd = new RestartCommand({
      exec: (execPath, argv) => {
        captured = { execPath, argv }
      },
    })

    await cmd.execute([], { cwd: '/', session: fakeSession })

    expect(captured).not.toBeNull()
    expect(captured!.execPath.length).toBeGreaterThan(0)
    expect(Array.isArray(captured!.argv)).toBe(true)
  })
})
