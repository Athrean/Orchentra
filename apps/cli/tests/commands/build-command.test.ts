import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import type { SessionControl, UsageTotals } from '@orchentra/cli-core'
import type { MemoryStore, PatternEntry } from '@orchentra/cli-core'

import { BuildCommand } from '../../src/commands/builtin/build'
import { createBuiltinRegistry } from '../../src/commands/builtin'
import type { CommandContext } from '../../src/commands/registry'
import type { LlmCaller } from '../../src/composites/scan'
import type { CheckRunner } from '../../src/composites/review'
import type { UiOutput } from '../../src/commands/ui-output'

const PLAN = {
  recommendedStack: 's',
  rationale: 'r',
  alternatives: [{ name: 'a', tradeoff: 't' }],
  architecture: 'arch',
  scaffold: [{ path: 'src/a.ts', purpose: 'thing a' }],
  verification: ['unit test a'],
}

function makeEntry(id: string, over: Partial<PatternEntry> = {}): PatternEntry {
  return {
    id,
    orgId: 'default',
    incidentId: null,
    embedding: [],
    pattern: 'default build pattern',
    resolution: 'default build resolution',
    failureType: 'code_bug',
    usageCount: 0,
    lastMatchedAt: null,
    createdAt: '2026-06-26T00:00:00.000Z',
    ...over,
  }
}

class FakeStore implements MemoryStore {
  constructor(private readonly entries: PatternEntry[]) {}
  save(): void {}
  load(): PatternEntry[] {
    return this.entries
  }
  updateUsage(): void {}
  updateUsageBatch(): void {}
  setFeedback(): void {}
  delete(): void {}
  has(): boolean {
    return false
  }
}

// One injected caller serves both phases: architect (JSON plan) then the
// builder codegen (file contents), distinguished by the system prompt.
function fakeLlm(code = 'export const a = 1\n'): LlmCaller {
  return async ({ systemPrompt }) =>
    systemPrompt.includes('architect')
      ? { text: JSON.stringify(PLAN), model: 'fake', tokensIn: 10, tokensOut: 20 }
      : { text: code, model: 'fake', tokensIn: 5, tokensOut: 3 }
}

function makeSession(
  usage: UsageTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
): SessionControl {
  return {
    getModel: () => 'claude-sonnet-4-20250514',
    setModel: () => 'claude-sonnet-4-20250514',
    getPermissionMode: () => 'workspace-write',
    setPermissionMode: (m) => m,
    getSessionId: () => 's1',
    getTurns: () => 0,
    getUsage: () => usage,
    clearHistory: () => {},
    forceCompact: () => {},
  }
}

function makeCtx(cwd: string): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  return { events, ctx: { cwd, session: makeSession(), ui: (o) => events.push(o) } }
}

function tmp(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'orchentra-build-'))
  // A discoverable check so runCheck has a gate to run.
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } }), 'utf8')
  return cwd
}

const pass: CheckRunner = () => ({ exitCode: 0, output: '' })
const failTsc: CheckRunner = () => ({ exitCode: 1, output: 'src/a.ts: error' })

function textOf(events: UiOutput[]): string {
  return (events.find((e) => e.kind === 'text') as Extract<UiOutput, { kind: 'text' }>).text
}

describe('/build command', () => {
  test('is registered as a first-class command', () => {
    const registry = createBuiltinRegistry()
    expect(registry.resolve('/build add a thing')).not.toBeInstanceOf(Error)
    expect(registry.allSpecs().map((s) => s.name)).toContain('build')
  })

  test('architects a need, writes the slice file, and reports it completed', async () => {
    const cwd = tmp()
    const { ctx, events } = makeCtx(cwd)

    await new BuildCommand({ llm: fakeLlm(), run: pass }).execute(['add', 'thing', 'a'], ctx)

    expect(existsSync(join(cwd, 'src/a.ts'))).toBe(true)
    expect(readFileSync(join(cwd, 'src/a.ts'), 'utf8')).toContain('export const a = 1')
    const text = textOf(events)
    expect(text).toContain('completed')
    expect(text).toContain('src/a.ts')
  })

  test('reports a slice whose check fails as FAIL with the check output', async () => {
    const cwd = tmp()
    const { ctx, events } = makeCtx(cwd)

    await new BuildCommand({ llm: fakeLlm(), run: failTsc }).execute(['add', 'thing', 'a'], ctx)

    const text = textOf(events)
    expect(text).toContain('1 failed')
    expect(text).toContain('[FAIL] src/a.ts')
    expect(text).toContain('src/a.ts: error')
  })

  test('with no need prints usage and does not call the model', async () => {
    const cwd = tmp()
    const { ctx, events } = makeCtx(cwd)
    let called = false
    const llm: LlmCaller = async () => {
      called = true
      return { text: '{}', model: 'm', tokensIn: 0, tokensOut: 0 }
    }

    await new BuildCommand({ llm, run: pass }).execute([], ctx)

    expect(called).toBe(false)
    expect((events[0] as Extract<UiOutput, { kind: 'note' }>).text).toContain('usage')
  })

  test('never overwrites an existing non-stub file', async () => {
    const cwd = tmp()
    const { ctx } = makeCtx(cwd)
    mkdirSync(join(cwd, 'src'), { recursive: true })
    const target = join(cwd, 'src/a.ts')
    writeFileSync(target, 'export const real = 99\n', 'utf8')

    await new BuildCommand({ llm: fakeLlm('export const a = 1\n'), run: pass }).execute(['add', 'thing', 'a'], ctx)

    expect(readFileSync(target, 'utf8')).toBe('export const real = 99\n')
  })

  test('uses the repo-aware runtime runner when command context provides one', async () => {
    const cwd = tmp()
    const usage: UsageTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
    const session = makeSession(usage)
    const events: UiOutput[] = []
    let prompt = ''
    const ctx: CommandContext = {
      cwd,
      session,
      ui: (o) => events.push(o),
      runTurn: async (input) => {
        prompt = input
        usage.inputTokens += 7
        usage.outputTokens += 4
      },
    }

    await new BuildCommand({ llm: fakeLlm('export const oneShot = true\n'), run: pass }).execute(
      ['add', 'thing', 'a'],
      ctx,
    )

    expect(prompt).toContain('Implement this /build slice using the workspace tools')
    expect(prompt).toContain('Target file(s): src/a.ts')
    expect(existsSync(join(cwd, 'src/a.ts'))).toBe(false)
    expect(textOf(events)).toContain('(model: fake · in 17 · out 24)')
  })

  test('injects the active terse mode into the builder system prompt', async () => {
    const cwd = tmp()
    const session = makeSession()
    session.getTerseMode = () => 'full'
    const events: UiOutput[] = []
    const ctx: CommandContext = { cwd, session, ui: (o) => events.push(o) }
    let builderSystem = ''
    const llm: LlmCaller = async ({ systemPrompt }) => {
      if (systemPrompt.includes('architect'))
        return { text: JSON.stringify(PLAN), model: 'f', tokensIn: 1, tokensOut: 1 }
      builderSystem = systemPrompt
      return { text: 'export const a = 1\n', model: 'f', tokensIn: 1, tokensOut: 1 }
    }

    await new BuildCommand({ llm, run: pass }).execute(['add', 'thing', 'a'], ctx)

    expect(builderSystem.toUpperCase()).toContain('TERSE OUTPUT MODE')
  })

  test('injects memory feedback guidance into the one-shot builder system prompt', async () => {
    const cwd = tmp()
    const { ctx } = makeCtx(cwd)
    const store = new FakeStore([
      makeEntry('11111111-1111-1111-1111-111111111111', {
        feedback: 'accepted',
        pattern: 'prefer existing dependency',
        resolution: 'reuse the package already in package.json',
      }),
      makeEntry('22222222-2222-2222-2222-222222222222', {
        feedback: 'rejected',
        pattern: 'avoid hand-rolled parser',
        resolution: 'use a structured parser',
      }),
      makeEntry('33333333-3333-3333-3333-333333333333', {
        pattern: 'unmarked build memory stays out',
      }),
    ])
    let builderSystem = ''
    const llm: LlmCaller = async ({ systemPrompt }) => {
      if (systemPrompt.includes('architect'))
        return { text: JSON.stringify(PLAN), model: 'f', tokensIn: 1, tokensOut: 1 }
      builderSystem = systemPrompt
      return { text: 'export const a = 1\n', model: 'f', tokensIn: 1, tokensOut: 1 }
    }

    await new BuildCommand({ llm, run: pass, store }).execute(['add', 'thing', 'a'], ctx)

    expect(builderSystem).toContain('Local Feedback Memory')
    expect(builderSystem).toContain('prefer existing dependency')
    expect(builderSystem).toContain('avoid hand-rolled parser')
    expect(builderSystem).not.toContain('unmarked build memory')
  })

  test('injects memory feedback guidance into the repo-aware builder turn prompt', async () => {
    const cwd = tmp()
    const session = makeSession()
    const events: UiOutput[] = []
    const store = new FakeStore([
      makeEntry('11111111-1111-1111-1111-111111111111', {
        feedback: 'accepted',
        pattern: 'prefer focused edits',
        resolution: 'change only the target slice',
      }),
    ])
    let prompt = ''
    const ctx: CommandContext = {
      cwd,
      session,
      ui: (o) => events.push(o),
      runTurn: async (input) => {
        prompt = input
      },
    }

    await new BuildCommand({ llm: fakeLlm(), run: pass, store }).execute(['add', 'thing', 'a'], ctx)

    expect(prompt).toContain('Local Feedback Memory')
    expect(prompt).toContain('prefer focused edits')
  })
})
