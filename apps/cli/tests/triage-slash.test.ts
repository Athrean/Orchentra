import { describe, expect, test } from 'bun:test'
import { CommandRegistry, type CommandContext } from '../src/commands/registry'
import { TriageSlashCommand } from '../src/commands/builtin/triage-slash'
import type { UiOutput } from '../src/commands/ui-output'

describe('/triage slash command (Slice G)', () => {
  test('resolves through CommandRegistry as `/triage`', () => {
    const registry = new CommandRegistry()
    registry.register(new TriageSlashCommand())
    const resolved = registry.resolve('/triage my-org/api#123')
    expect(resolved).not.toBeNull()
    expect(resolved).not.toBeInstanceOf(Error)
    if (!resolved || resolved instanceof Error) return
    expect(resolved.handler.spec.name).toBe('triage')
    expect(resolved.args).toEqual(['my-org/api#123'])
  })

  test('returns false and surfaces a usage hint when called with no spec', async () => {
    const cmd = new TriageSlashCommand()
    const captured: UiOutput[] = []
    const ctx: CommandContext = {
      cwd: process.cwd(),
      session: {} as CommandContext['session'],
      ui: (out) => captured.push(out),
    }
    const ok = await cmd.execute([], ctx)
    expect(ok).toBe(false)
    const note = captured.find((o) => o.kind === 'note')
    expect(note).toBeDefined()
  })

  test('declares the GitHub-shaped argument hint', () => {
    const cmd = new TriageSlashCommand()
    expect(cmd.spec.argumentHint).toBe('<owner/repo#runId>')
  })
})
