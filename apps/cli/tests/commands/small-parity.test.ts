import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import type { EffortTier, SessionControl, UsageTotals } from '@orchentra/cli-core'

import { createBuiltinRegistry } from '../../src/commands/builtin'
import { PlanCommand } from '../../src/commands/builtin/plan'
import { PlanModeCommand } from '../../src/commands/builtin/planmode'
import { EffortCommand } from '../../src/commands/builtin/effort'
import type { LlmCaller } from '../../src/composites/scan'
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

  test('/effort with no arg opens the slider picker in TUI mode', async () => {
    const session = makeSession()
    session.setEffort?.('xhigh')
    const { ctx, events } = makeCtx('/work', session)

    await new EffortCommand().execute([], ctx)

    expect(events).toEqual([{ kind: 'effort-picker', current: 'xhigh' }])
  })

  test('/effort accepts the new max tier', async () => {
    const session = makeSession()
    const { ctx } = makeCtx('/work', session)

    await new EffortCommand().execute(['max'], ctx)

    expect(session.getEffort?.()).toBe('max')
  })

  test('/think sets high effort by default', async () => {
    const session = makeSession()
    const { ctx, events } = makeCtx('/work', session)

    await new ThinkCommand().execute([], ctx)

    expect(session.getEffort?.()).toBe('high')
    expect(events).toEqual([{ kind: 'note', text: 'Thinking effort set to: high' }])
  })

  test('/planmode enters and exits runtime plan mode', async () => {
    const session = makeSession()
    const { ctx, events } = makeCtx('/work', session)
    const cmd = new PlanModeCommand()

    await cmd.execute([], ctx)
    expect(session.getPlanMode?.()).toBe(true)

    await cmd.execute(['off'], ctx)
    expect(session.getPlanMode?.()).toBe(false)
    expect(events).toEqual([
      { kind: 'note', text: 'Plan mode enabled. Tools are blocked until /planmode off.' },
      { kind: 'note', text: 'Plan mode disabled. Tools may run again.' },
    ])
  })

  test('/plan architects a need into a rendered proposal', async () => {
    const { ctx, events } = makeCtx('/work')
    const llm: LlmCaller = async () => ({
      text: JSON.stringify({
        recommendedStack: 'token-bucket in cli-tools',
        rationale: 'no new dep',
        alternatives: [{ name: 'sliding-window', tradeoff: 'more state' }],
        architecture: 'one pure module',
        scaffold: [{ path: 'packages/cli-tools/src/rate-limit.ts', purpose: 'the limiter' }],
        verification: ['unit test the refill math'],
      }),
      model: 'fake-model',
      tokensIn: 10,
      tokensOut: 20,
    })

    await new PlanCommand(llm).execute(['add', 'a', 'rate', 'limiter'], ctx)

    expect(events).toHaveLength(1)
    const text = (events[0] as Extract<UiOutput, { kind: 'text' }>).text
    expect(text).toContain('Recommended: token-bucket in cli-tools')
    expect(text).toContain('1. sliding-window — more state')
    expect(text).toContain('Proposed scaffold (not written):')
    expect(text).toContain('packages/cli-tools/src/rate-limit.ts — the limiter')
  })

  test('/plan --scaffold writes the proposed scaffold and reports it', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-plan-scaffold-'))
    const { ctx, events } = makeCtx(cwd)
    const llm: LlmCaller = async () => ({
      text: JSON.stringify({
        recommendedStack: 'token-bucket in cli-tools',
        rationale: 'no new dep',
        alternatives: [{ name: 'sliding-window', tradeoff: 'more state' }],
        architecture: 'one pure module',
        scaffold: [{ path: 'src/limiter.ts', purpose: 'the limiter' }],
        verification: ['unit test the refill math'],
      }),
      model: 'fake-model',
      tokensIn: 10,
      tokensOut: 20,
    })

    await new PlanCommand(llm).execute(['--scaffold', 'add', 'a', 'limiter'], ctx)

    expect(existsSync(join(cwd, 'src/limiter.ts'))).toBe(true)
    const text = (events.find((e) => e.kind === 'text') as Extract<UiOutput, { kind: 'text' }>).text
    expect(text).toContain('Wrote scaffold')
    expect(text).toContain('src/limiter.ts')
  })

  test('/plan without --scaffold does not write files', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-plan-noscaffold-'))
    const { ctx } = makeCtx(cwd)
    const llm: LlmCaller = async () => ({
      text: JSON.stringify({
        recommendedStack: 's',
        rationale: 'r',
        alternatives: [{ name: 'a', tradeoff: 't' }],
        architecture: 'arch',
        scaffold: [{ path: 'src/limiter.ts', purpose: 'the limiter' }],
        verification: ['v'],
      }),
      model: 'fake-model',
      tokensIn: 1,
      tokensOut: 1,
    })

    await new PlanCommand(llm).execute(['add', 'a', 'limiter'], ctx)

    expect(existsSync(join(cwd, 'src/limiter.ts'))).toBe(false)
  })

  test('/plan with no need opens the depth picker and does not call the model', async () => {
    const { ctx, events } = makeCtx('/work')
    let called = false
    const llm: LlmCaller = async () => {
      called = true
      return { text: '{}', model: 'm', tokensIn: 0, tokensOut: 0 }
    }
    await new PlanCommand(llm).execute([], ctx)
    expect(called).toBe(false)
    expect(events[0]).toEqual({ kind: 'plan-level-picker', current: 'plus' })
  })

  test('/plan with no inline need can architect from recent transcript context', async () => {
    const { ctx, events } = makeCtx('/work')
    let userPrompt = ''
    const llm: LlmCaller = async (req) => {
      userPrompt = req.userPrompt
      return {
        text: JSON.stringify({
          recommendedStack: 'small transcript-aware plan path',
          rationale: 'reuse the existing architect',
          alternatives: [{ name: 'force inline args', tradeoff: 'repeats context' }],
          architecture: 'command context supplies compact transcript text',
          scaffold: [{ path: 'apps/cli/src/commands/builtin/plan.ts', purpose: 'consume context' }],
          verification: ['run command tests'],
        }),
        model: 'fake-model',
        tokensIn: 11,
        tokensOut: 22,
      }
    }
    ctx.getRecentTranscriptContext = () => 'Recent transcript context:\nUser: add retry handling\nAssistant: Where?'

    await new PlanCommand(llm).execute([], ctx)

    expect(userPrompt).toContain('User: add retry handling')
    expect(events).toHaveLength(1)
    const text = (events[0] as Extract<UiOutput, { kind: 'text' }>).text
    expect(text).toContain('Recommended: small transcript-aware plan path')
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
