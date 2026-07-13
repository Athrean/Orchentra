import { describe, expect, test } from 'bun:test'
import { LoginCommand } from '../../src/commands/builtin/login'
import type { CommandContext } from '../../src/commands/registry'
import type { UiOutput } from '../../src/commands/ui-output'

function fakeCtx(): { ctx: CommandContext; emitted: UiOutput[] } {
  const emitted: UiOutput[] = []
  const ctx: CommandContext = {
    cwd: '/tmp',
    // SessionControl is a runtime object; the slash handler does not touch it
    // for zero-args + TUI emit, so a stub here is intentional.
    session: {} as CommandContext['session'],
    ui: (output) => emitted.push(output),
  }
  return { ctx, emitted }
}

describe('/login slash handler', () => {
  test('zero args in TUI emits login-picker (not the bail-out card)', async () => {
    const cmd = new LoginCommand()
    const { ctx, emitted } = fakeCtx()
    await cmd.execute([], ctx)
    expect(emitted.length).toBe(1)
    expect(emitted[0]?.kind).toBe('login-picker')
  })

  test('provider args use shared login service', async () => {
    const cmd = new LoginCommand()
    const { ctx, emitted } = fakeCtx()

    expect(await cmd.execute(['github'], ctx)).toBe(true)
    expect(emitted).toEqual([{ kind: 'note', tone: 'info', text: 'Run in a fresh terminal: orchentra login github' }])
  })
})
