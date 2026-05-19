import { describe, expect, test } from 'bun:test'
import { TriageSlashCommand } from '../src/commands/builtin/triage-slash'
import { SummarizeSlashCommand } from '../src/commands/builtin/summarize-slash'
import { CleanSlashCommand } from '../src/commands/builtin/clean-slash'
import type { CommandContext } from '../src/commands/registry'
import type { UiOutput } from '../src/commands/ui-output'

function makeCtx(): { ctx: CommandContext; outputs: UiOutput[] } {
  const outputs: UiOutput[] = []
  const ctx: CommandContext = {
    cwd: '/tmp/active-repo-default-test',
    session: {} as CommandContext['session'],
    ui: (o) => outputs.push(o),
  }
  return { ctx, outputs }
}

describe('activeRepo default — /triage', () => {
  test('uses activeRepo when the user supplies only a bare run id', async () => {
    let captured: string | null = null
    const cmd = new TriageSlashCommand({
      getActiveRepo: () => 'acme/api',
      runTriage: async (opts) => {
        captured = opts.spec
        return 0
      },
    })
    const { ctx } = makeCtx()
    const ok = await cmd.execute(['42'], ctx)
    expect(ok).toBe(true)
    expect(captured).toBe('acme/api#42')
  })

  test('warns and skips execution when neither spec nor activeRepo is supplied', async () => {
    const cmd = new TriageSlashCommand({
      getActiveRepo: () => null,
      runTriage: async () => {
        throw new Error('runTriage should not be invoked')
      },
    })
    const { ctx, outputs } = makeCtx()
    const ok = await cmd.execute([], ctx)
    expect(ok).toBe(false)
    const note = outputs.find((o) => o.kind === 'note')
    expect(note?.kind === 'note' && note.text.includes('/repos')).toBe(true)
  })
})

describe('activeRepo default — /summarize', () => {
  test('uses activeRepo when the user supplies #runId only', async () => {
    let captured: string | null = null
    const cmd = new SummarizeSlashCommand({
      getActiveRepo: () => 'acme/web',
      runSummarize: async (opts) => {
        captured = opts.spec
        return 0
      },
    })
    const { ctx } = makeCtx()
    const ok = await cmd.execute(['#7'], ctx)
    expect(ok).toBe(true)
    expect(captured).toBe('acme/web#7')
  })
})

describe('activeRepo default — /clean', () => {
  test('uses activeRepo when the user supplies no positional arg', async () => {
    let capturedOwner: string | null = null
    let capturedRepo: string | null = null
    const cmd = new CleanSlashCommand({
      getActiveRepo: () => 'acme/api',
      clean: async (opts) => {
        capturedOwner = opts.owner
        capturedRepo = opts.repo
        return { deleted: [], skipped: [] }
      },
    })
    const { ctx } = makeCtx()
    const ok = await cmd.execute(['--dry-run'], ctx)
    expect(ok).toBe(true)
    expect(capturedOwner).toBe('acme')
    expect(capturedRepo).toBe('api')
  })
})
