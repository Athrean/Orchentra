import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import type { SessionControl, UsageTotals } from '@orchentra/cli-core'

import { ReviewCommand } from '../../src/commands/builtin/review'
import type { CheckRunner } from '../../src/composites/review'
import type { LlmCaller } from '../../src/composites/scan'
import type { CommandContext } from '../../src/commands/registry'
import type { UiOutput } from '../../src/commands/ui-output'

function makeCtx(cwd: string): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  const usage: UsageTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  const session = {
    getModel: () => 'claude-sonnet-4-20250514',
    setModel: () => 'claude-sonnet-4-20250514',
    getPermissionMode: () => 'workspace-write',
    setPermissionMode: (m) => m,
    getSessionId: () => 's1',
    getTurns: () => 0,
    getUsage: () => usage,
    clearHistory: () => {},
    forceCompact: () => {},
  } as unknown as SessionControl
  return { events, ctx: { cwd, session, ui: (o) => events.push(o) } }
}

const findingsLlm: LlmCaller = async () => ({
  text: JSON.stringify([
    { file: 'a.ts', line: 3, severity: 'P1', title: 'off-by-one', description: 'loop overruns', suggestedFix: 'use <' },
  ]),
  model: 'fake',
  tokensIn: 10,
  tokensOut: 20,
})

describe('/review command', () => {
  test('a scan error surfaces as a warn note', async () => {
    const { ctx, events } = makeCtx(mkdtempSync(join(tmpdir(), 'review-cmd-')))
    const run: CheckRunner = () => ({ exitCode: 0, output: '' })
    await new ReviewCommand({ llm: findingsLlm, run }).execute(['--path', 'missing-on-purpose.ts'], ctx)

    expect(events[0]).toMatchObject({ kind: 'note', tone: 'warn' })
  })

  test('verdict text reflects a failing gate', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'review-cmd2-'))
    await Bun.write(join(cwd, 'a.ts'), 'export const x = 1\n')
    await Bun.write(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'bun test' } }))
    const { ctx, events } = makeCtx(cwd)
    const run: CheckRunner = () => ({ exitCode: 1, output: 'FAIL a.test.ts' })
    await new ReviewCommand({ llm: findingsLlm, run }).execute(['--path', 'a.ts'], ctx)

    expect(events).toHaveLength(1)
    const text = (events[0] as Extract<UiOutput, { kind: 'text' }>).text
    expect(text).toContain('[P1] a.ts:3 — off-by-one')
    expect(text).toContain('Verified by running:')
    expect(text).toContain('[FAIL] test — bun run test (exit 1)')
    expect(text).toContain('findings corroborated by a real failing gate')
  })
})
