import { describe, expect, test } from 'bun:test'
import { CommandRegistry, type CommandContext } from '../src/commands/registry'
import { SummarizeSlashCommand } from '../src/commands/builtin/summarize-slash'
import type { UiOutput } from '../src/commands/ui-output'

describe('/summarize slash command (Flow 3)', () => {
  test('resolves through CommandRegistry as `/summarize`', () => {
    const registry = new CommandRegistry()
    registry.register(new SummarizeSlashCommand())
    const resolved = registry.resolve('/summarize my-org/api#123')
    expect(resolved).not.toBeNull()
    expect(resolved).not.toBeInstanceOf(Error)
    if (!resolved || resolved instanceof Error) return
    expect(resolved.handler.spec.name).toBe('summarize')
    expect(resolved.args).toEqual(['my-org/api#123'])
  })

  test('rejects free-form prose — only owner/repo#runId is accepted', async () => {
    const cmd = new SummarizeSlashCommand()
    const captured: UiOutput[] = []
    const ctx: CommandContext = {
      cwd: process.cwd(),
      session: {} as CommandContext['session'],
      ui: (out) => captured.push(out),
    }
    // No-arg invocation must surface the usage hint, not silently accept.
    const ok = await cmd.execute([], ctx)
    expect(ok).toBe(false)
    const note = captured.find((o) => o.kind === 'note')
    expect(note).toBeDefined()
    if (note?.kind === 'note') {
      expect(note.text).toMatch(/owner\/repo#runId/)
    }
  })

  test('declares the GitHub-shaped argument hint', () => {
    const cmd = new SummarizeSlashCommand()
    expect(cmd.spec.argumentHint).toBe('<owner/repo#runId>')
  })

  test('summary line names the three sections it produces', () => {
    const cmd = new SummarizeSlashCommand()
    // Help-listing should hint at the locked output shape so users see it
    // before they call. "root cause" + "fix" are the load-bearing tokens.
    expect(cmd.spec.summary.toLowerCase()).toContain('root cause')
    expect(cmd.spec.summary.toLowerCase()).toContain('fix')
  })
})
