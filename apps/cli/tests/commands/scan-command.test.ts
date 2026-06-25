import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import type { SessionControl, UsageTotals } from '@orchentra/cli-core'

import { ScanSlashCommand } from '../../src/commands/builtin/scan-slash'
import type { LlmCaller } from '../../src/composites/scan'
import type { CommandContext } from '../../src/commands/registry'
import type { UiOutput } from '../../src/commands/ui-output'

function makeCtx(cwd: string): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  const usage: UsageTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  const session = {
    getModel: () => 'claude-sonnet-4-20250514',
    getUsage: () => usage,
  } as unknown as SessionControl
  return { events, ctx: { cwd, session, ui: (o) => events.push(o) } }
}

describe('/scan command (BYOK retrofit)', () => {
  test('renders findings from the injected caller', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'scan-cmd-'))
    await Bun.write(join(cwd, 'a.ts'), 'export const x = 1\n')
    const { ctx, events } = makeCtx(cwd)
    const llm: LlmCaller = async () => ({
      text: JSON.stringify([
        { file: 'a.ts', line: 1, severity: 'P2', title: 'naming', description: 'x is vague', suggestedFix: null },
      ]),
      model: 'fake',
      tokensIn: 5,
      tokensOut: 9,
    })
    await new ScanSlashCommand(llm).execute(['--path', 'a.ts'], ctx)

    expect(events).toHaveLength(1)
    const text = (events[0] as Extract<UiOutput, { kind: 'text' }>).text
    expect(text).toContain('[P2] a.ts:1 — naming')
    expect(text).toContain('(model: fake · in 5 · out 9)')
  })
})
