import { existsSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
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
import { ClearCommand } from '../../src/commands/builtin/clear'
import {
  AddDirCommand,
  CdCommand,
  CopyCommand,
  ForkCommand,
  GoalCommand,
  TasksCommand,
  UndoCommand,
} from '../../src/commands/builtin/terminal-parity'
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

  test('priority terminal UX commands are registered', () => {
    const registry = createBuiltinRegistry()
    const names = registry.allSpecs().map((spec) => spec.name)

    expect(names).toContain('context')
    expect(names).toContain('copy')
    expect(names).toContain('cd')
    expect(names).toContain('background')
    expect(names).toContain('tasks')
    expect(names).toContain('undo')
    expect(registry.resolve('/rewind')).not.toBeInstanceOf(Error)
    expect(names).toContain('add-dir')
    expect(names).toContain('branch')
    expect(names).toContain('fork')
    expect(names).toContain('goal')
    expect(names).toContain('hooks')
    expect(names).toContain('terminal-setup')
    expect(names).toContain('tui')
    expect(names).toContain('statusline')
    expect(names).toContain('usage')
    expect(names).toContain('usage-credits')
  })

  test('/goal stores, reports, and clears a session goal', async () => {
    let goal: { objective: string; createdAt: string } | null = null
    const session: SessionControl = {
      ...makeSession(),
      getGoal: () => goal,
      setGoal: (objective) => {
        goal = { objective, createdAt: '2026-07-03T00:00:00.000Z' }
        return goal
      },
      clearGoal: () => {
        goal = null
      },
    }
    const { ctx, events } = makeCtx('/work', session)
    const cmd = new GoalCommand()

    await cmd.execute(['fix', 'terminal', 'ux'], ctx)
    await cmd.execute(['status'], ctx)
    await cmd.execute(['clear'], ctx)

    expect(goal).toBeNull()
    expect(events[0]).toEqual({ kind: 'note', text: 'Goal set: fix terminal ux', tone: 'info' })
    expect(events[1]?.kind).toBe('card')
    expect(events[2]).toEqual({ kind: 'note', text: 'Goal cleared.', tone: 'info' })
  })

  test('/cd updates the session cwd and TUI cwd hook', async () => {
    const oldCwd = process.cwd()
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-cd-'))
    let sessionCwd = '/work'
    let tuiCwd = '/work'
    const session: SessionControl = {
      ...makeSession(),
      setCwd: (next) => {
        sessionCwd = next
        return next
      },
    }
    const { ctx, events } = makeCtx('/work', session)
    ctx.setCwd = (next) => {
      tuiCwd = next
    }

    try {
      await new CdCommand().execute([cwd], ctx)
    } finally {
      process.chdir(oldCwd)
    }

    expect(sessionCwd).toBe(cwd)
    expect(tuiCwd).toBe(cwd)
    expect(events).toEqual([{ kind: 'note', text: `cwd: ${cwd}`, tone: 'info' }])
  })

  test('/copy reads the transcript snapshot and reports clipboard availability', async () => {
    const old = process.env.ORCHENTRA_NO_CLIPBOARD
    process.env.ORCHENTRA_NO_CLIPBOARD = '1'
    const { ctx, events } = makeCtx('/work')
    ctx.getTranscriptText = () => 'User: hi\nAssistant: hello'

    try {
      await new CopyCommand().execute([], ctx)
    } finally {
      if (old === undefined) delete process.env.ORCHENTRA_NO_CLIPBOARD
      else process.env.ORCHENTRA_NO_CLIPBOARD = old
    }

    expect(events).toEqual([{ kind: 'note', text: 'Clipboard unavailable.', tone: 'warn' }])
  })

  test('/tasks lists and cancels runtime tasks', async () => {
    let cancelled = false
    const session: SessionControl = {
      ...makeSession(),
      listTaskSummaries: () => [
        {
          id: 'task_1_abcd',
          status: 'running',
          prompt: 'review refs',
          createdAt: '2026-07-03T00:00:00.000Z',
        },
      ],
      cancelTask: (id) => {
        cancelled = id === 'task_1_abcd'
        return cancelled
      },
    }
    const { ctx, events } = makeCtx('/work', session)
    const cmd = new TasksCommand()

    await cmd.execute([], ctx)
    await cmd.execute(['cancel', 'task_1_abcd'], ctx)

    expect(events[0]?.kind).toBe('card')
    expect(cancelled).toBe(true)
    expect(events[1]).toEqual({ kind: 'note', text: 'Cancelled task_1_abcd.', tone: 'info' })
  })

  test('/undo reverts the previous turn file edits through the session', async () => {
    const session: SessionControl = {
      ...makeSession(),
      undoLastFileEdits: async () => ({
        kind: 'applied',
        files: [{ path: '/work/file.txt', action: 'restored' }],
      }),
    }
    const { ctx, events } = makeCtx('/work', session)

    await new UndoCommand().execute([], ctx)

    expect(events).toEqual([{ kind: 'note', text: 'Undid 1 file edit: /work/file.txt restored.', tone: 'info' }])
  })

  test('/add-dir stores an extra readable workspace root', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-add-dir-cwd-'))
    const extra = mkdtempSync(join(tmpdir(), 'orchentra-add-dir-extra-'))
    let roots = [cwd]
    const session: SessionControl = {
      ...makeSession(),
      getWorkspaceRoots: () => roots,
      addWorkspaceRoot: (path) => {
        roots = Array.from(new Set([...roots, path]))
        return roots
      },
    }
    const { ctx, events } = makeCtx(cwd, session)

    await new AddDirCommand().execute([extra], ctx)

    expect(roots).toEqual([cwd, extra])
    expect(events).toEqual([{ kind: 'note', text: `Added read root: ${extra}`, tone: 'info' }])
  })

  test('/fork creates a git branch and forks the live session', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-fork-cmd-'))
    git(cwd, ['init', '-b', 'main'])
    let forked = false
    const session: SessionControl = {
      ...makeSession(),
      forkSession: async () => {
        forked = true
        return { sessionId: 'forked-session', path: join(cwd, 'forked-session.jsonl') }
      },
    }
    const { ctx, events } = makeCtx(cwd, session)

    await new ForkCommand().execute(['parallel-work'], ctx)

    expect(git(cwd, ['branch', '--show-current']).stdout.trim()).toBe('parallel-work')
    expect(forked).toBe(true)
    expect(events).toEqual([
      {
        kind: 'note',
        text: 'Switched from main to parallel-work. Forked session: forked-session.',
        tone: 'info',
      },
    ])
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

  test('/clear starts a fresh session and asks the TUI to reset visible chat', async () => {
    let started = false
    let cleared = false
    const session: SessionControl = {
      ...makeSession(),
      clearHistory: () => {
        cleared = true
      },
      startNewSession: async () => {
        started = true
      },
    }
    const { ctx, events } = makeCtx('/work', session)

    await new ClearCommand().execute([], ctx)

    expect(started).toBe(true)
    expect(cleared).toBe(false)
    expect(events).toEqual([{ kind: 'clear-session', text: 'Conversation cleared.' }])
  })

  test('/clear accepts --confirm for reference CLI compatibility', async () => {
    let started = false
    const session: SessionControl = {
      ...makeSession(),
      startNewSession: async () => {
        started = true
      },
    }
    const { ctx, events } = makeCtx('/work', session)

    await new ClearCommand().execute(['--confirm'], ctx)

    expect(started).toBe(true)
    expect(events).toEqual([{ kind: 'clear-session', text: 'Conversation cleared.' }])
  })

  test('/clear rejects unsupported args without clearing', async () => {
    let started = false
    let cleared = false
    const session: SessionControl = {
      ...makeSession(),
      clearHistory: () => {
        cleared = true
      },
      startNewSession: async () => {
        started = true
      },
    }
    const { ctx, events } = makeCtx('/work', session)

    await new ClearCommand().execute(['now'], ctx)

    expect(started).toBe(false)
    expect(cleared).toBe(false)
    expect(events).toEqual([
      { kind: 'note', text: "Unsupported /clear argument 'now'. Use /clear or /clear --confirm.", tone: 'warn' },
    ])
  })

  test('/clear aliases match Claude-style fresh-session verbs', () => {
    const registry = createBuiltinRegistry()

    expect(registry.resolve('/reset')).not.toBeInstanceOf(Error)
    expect(registry.resolve('/new')).not.toBeInstanceOf(Error)
    expect(registry.resolve('/cls')).not.toBeInstanceOf(Error)
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
    let systemPrompt = ''
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
    const recordingLlm: LlmCaller = async (input) => {
      systemPrompt = input.systemPrompt
      return llm(input)
    }

    await new PlanCommand(recordingLlm).execute(['add', 'a', 'rate', 'limiter'], ctx)

    expect(systemPrompt).toContain('ORCHENTRA SPINE')
    expect(systemPrompt).toContain('Task focus: /plan architect')
    expect(events).toHaveLength(1)
    const text = (events[0] as Extract<UiOutput, { kind: 'text' }>).text
    expect(text).toContain('Recommended: token-bucket in cli-tools')
    expect(text).toContain('1. sliding-window — more state')
    expect(text).toContain('Proposed scaffold (not written):')
    expect(text).toContain('packages/cli-tools/src/rate-limit.ts — the limiter')
  })

  test('/plan supports a bare architect llm', async () => {
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

function git(cwd: string, args: readonly string[]): { stdout: string; stderr: string } {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`)
  }
  return { stdout: result.stdout, stderr: result.stderr }
}
