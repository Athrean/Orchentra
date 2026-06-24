import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import type { EffortTier, SessionControl, UsageTotals } from '@orchentra/cli-core'

import { createBuiltinRegistry } from '../../src/commands/builtin'
import { PlanCommand } from '../../src/commands/builtin/plan'
import { SearchCommand } from '../../src/commands/builtin/search'
import { ThinkCommand } from '../../src/commands/builtin/think'
import type { CommandContext } from '../../src/commands/registry'
import type { UiOutput } from '../../src/commands/ui-output'

function makeSession(): SessionControl {
  let effort: EffortTier = 'medium'
  let planMode = false
  const usage: UsageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  }
  return {
    getModel: () => 'claude-sonnet-4-20250514',
    setModel: () => 'claude-sonnet-4-20250514',
    getPermissionMode: () => 'workspace-write',
    setPermissionMode: (mode) => mode,
    getSessionId: () => 'session-1',
    getTurns: () => 0,
    getUsage: () => usage,
    clearHistory: () => {},
    forceCompact: () => {},
    getEffort: () => effort,
    setEffort: (next) => {
      effort = next
      return effort
    },
    getPlanMode: () => planMode,
    setPlanMode: (next) => {
      planMode = next
      return planMode
    },
  }
}

function makeCtx(cwd: string, session = makeSession()): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  return {
    events,
    ctx: { cwd, session, ui: (output) => events.push(output) },
  }
}

describe('small slash parity commands', () => {
  test('/review is registered as a first-class command', () => {
    const registry = createBuiltinRegistry()

    expect(registry.resolve('/review --diff')).not.toBeInstanceOf(Error)
    expect(registry.allSpecs().map((spec) => spec.name)).toContain('review')
  })

  test('/think sets high effort by default', async () => {
    const session = makeSession()
    const { ctx, events } = makeCtx('/work', session)

    await new ThinkCommand().execute([], ctx)

    expect(session.getEffort?.()).toBe('high')
    expect(events).toEqual([{ kind: 'note', text: 'Thinking effort set to: high' }])
  })

  test('/plan enters and exits runtime plan mode', async () => {
    const session = makeSession()
    const { ctx, events } = makeCtx('/work', session)
    const cmd = new PlanCommand()

    await cmd.execute([], ctx)
    expect(session.getPlanMode?.()).toBe(true)

    await cmd.execute(['off'], ctx)
    expect(session.getPlanMode?.()).toBe(false)
    expect(events).toEqual([
      { kind: 'note', text: 'Plan mode enabled. Tools are blocked until /plan off.' },
      { kind: 'note', text: 'Plan mode disabled. Tools may run again.' },
    ])
  })

  test('/search finds content under the workspace root', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-search-command-'))
    await Bun.write(join(cwd, 'src.ts'), 'export const needle = 42\n')
    await Bun.write(join(cwd, 'other.txt'), 'no match\n')
    const { ctx, events } = makeCtx(cwd)

    await new SearchCommand().execute(['needle'], ctx)

    expect(events).toHaveLength(1)
    expect(events[0]?.kind).toBe('text')
    expect((events[0] as Extract<UiOutput, { kind: 'text' }>).text).toContain('src.ts:1:export const needle = 42')
  })
})
