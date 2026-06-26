import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import type { SessionControl, UsageTotals } from '@orchentra/cli-core'
import type { MemoryStore, PatternEntry } from '@orchentra/cli-core'
import type { GitHubClient } from '@orchentra/cli-api'

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

function makeEntry(id: string, over: Partial<PatternEntry> = {}): PatternEntry {
  return {
    id,
    orgId: 'default',
    incidentId: null,
    embedding: [],
    pattern: 'accepted review pattern',
    resolution: 'reuse the accepted fix',
    failureType: 'code_bug',
    usageCount: 0,
    lastMatchedAt: null,
    createdAt: '2026-06-26T00:00:00.000Z',
    ...over,
  }
}

class FakeStore implements MemoryStore {
  constructor(public entries: PatternEntry[]) {}
  save(): void {}
  load(): PatternEntry[] {
    return this.entries
  }
  updateUsage(): void {}
  updateUsageBatch(): void {}
  setFeedback(_org: string, id: string, feedback: 'accepted' | 'rejected', at = new Date()): void {
    this.entries = this.entries.map((entry) =>
      entry.id === id ? { ...entry, feedback, feedbackAt: at.toISOString() } : entry,
    )
  }
  delete(): void {}
  has(): boolean {
    return false
  }
}

describe('/review command', () => {
  test('a scan error surfaces as a warn note', async () => {
    const { ctx, events } = makeCtx(mkdtempSync(join(tmpdir(), 'review-cmd-')))
    const run: CheckRunner = () => ({ exitCode: 0, output: '' })
    await new ReviewCommand({ llm: findingsLlm, run }).execute(['--path', 'missing-on-purpose.ts'], ctx)

    expect(events[0]).toMatchObject({ kind: 'note', tone: 'warn' })
  })

  test('tags a finding the failing gate references as corroborated', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'review-cmd2-'))
    await Bun.write(join(cwd, 'a.ts'), 'export const x = 1\n')
    await Bun.write(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'bun test' } }))
    const { ctx, events } = makeCtx(cwd)
    const run: CheckRunner = () => ({ exitCode: 1, output: 'FAIL a.ts:3 expected <= got <' })
    await new ReviewCommand({ llm: findingsLlm, run }).execute(['--path', 'a.ts'], ctx)

    expect(events).toHaveLength(1)
    const text = (events[0] as Extract<UiOutput, { kind: 'text' }>).text
    expect(text).toContain('[P1] a.ts:3 — off-by-one — corroborated by: test')
    expect(text).toContain('[FAIL] test — bun run test (exit 1)')
    expect(text).toContain('1/1 finding(s) corroborated by a failing gate')
  })

  test('marks a finding unrelated to the failure as unverified', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'review-cmd3-'))
    await Bun.write(join(cwd, 'a.ts'), 'export const x = 1\n')
    await Bun.write(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'bun test' } }))
    const { ctx, events } = makeCtx(cwd)
    const run: CheckRunner = () => ({ exitCode: 1, output: 'FAIL b.ts:9 unrelated' })
    await new ReviewCommand({ llm: findingsLlm, run }).execute(['--path', 'a.ts'], ctx)

    const text = (events[0] as Extract<UiOutput, { kind: 'text' }>).text
    expect(text).toContain('off-by-one — unverified')
    expect(text).toContain('none reference a proposed finding')
  })

  test('ingests review feedback markers from PR comments', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'review-feedback-'))
    const store = new FakeStore([
      makeEntry('11111111-1111-1111-1111-111111111111'),
      makeEntry('22222222-2222-2222-2222-222222222222'),
    ])
    const { ctx, events } = makeCtx(cwd)

    await new ReviewCommand({
      store,
      now: () => new Date('2026-06-26T12:00:00.000Z'),
      inferRepo: () => ({ owner: 'o', repo: 'r' }),
      resolveToken: () => ({ token: 't', source: 'env' }),
      createClient: () => ({}) as GitHubClient,
      listIssueComments: async () => [{ id: 1, body: 'orchentra feedback: 11111111 accepted', html_url: 'issue-url' }],
      listPullReviewComments: async () => [{ id: 2, body: '/memory mark 22222222 rejected', html_url: 'review-url' }],
    }).execute(['feedback', '--pr', '42'], ctx)

    expect(store.entries[0].feedback).toBe('accepted')
    expect(store.entries[0].feedbackAt).toBe('2026-06-26T12:00:00.000Z')
    expect(store.entries[1].feedback).toBe('rejected')
    expect(events[0]).toMatchObject({
      kind: 'note',
      tone: 'info',
      text: 'Applied review feedback: 2 applied, 0 missing, 0 ambiguous, 0 ignored.',
    })
  })

  test('feedback subcommand reports usage and missing prereqs', async () => {
    const { ctx, events } = makeCtx(mkdtempSync(join(tmpdir(), 'review-feedback-prereq-')))

    await new ReviewCommand().execute(['feedback'], ctx)
    expect(events[0]).toMatchObject({ kind: 'note', tone: 'warn', text: 'usage: /review feedback --pr <number>' })

    await new ReviewCommand({
      inferRepo: () => null,
    }).execute(['feedback', '--pr', '42'], ctx)
    expect(events[1]).toMatchObject({ kind: 'note', tone: 'warn' })
    expect((events[1] as Extract<UiOutput, { kind: 'note' }>).text).toContain('No GitHub origin')

    await new ReviewCommand({
      inferRepo: () => ({ owner: 'o', repo: 'r' }),
      resolveToken: () => null,
    }).execute(['feedback', '--pr', '42'], ctx)
    expect(events[2]).toMatchObject({ kind: 'note', tone: 'warn' })
    expect((events[2] as Extract<UiOutput, { kind: 'note' }>).text).toContain('No GitHub token')
  })

  test('injects accepted and rejected memory feedback into the scan prompt', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'review-feedback-guidance-'))
    await Bun.write(join(cwd, 'a.ts'), 'export const x = 1\n')
    await Bun.write(join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'bun test' } }))
    const { ctx } = makeCtx(cwd)
    const store = new FakeStore([
      makeEntry('11111111-1111-1111-1111-111111111111', {
        feedback: 'accepted',
        pattern: 'prefer exact file references',
        resolution: 'include concrete file paths in findings',
      }),
      makeEntry('22222222-2222-2222-2222-222222222222', {
        feedback: 'rejected',
        pattern: 'avoid vague style-only findings',
        resolution: 'skip generic comments without a failing gate',
      }),
      makeEntry('33333333-3333-3333-3333-333333333333', {
        pattern: 'unmarked memory stays out',
      }),
    ])
    let systemPrompt = ''
    const llm: LlmCaller = async (input) => {
      systemPrompt = input.systemPrompt
      return { text: '[]', model: 'fake', tokensIn: 1, tokensOut: 1 }
    }

    await new ReviewCommand({ llm, run: () => ({ exitCode: 0, output: '' }), store }).execute(['--path', 'a.ts'], ctx)

    expect(systemPrompt).toContain('Local Feedback Memory')
    expect(systemPrompt).toContain('prefer exact file references')
    expect(systemPrompt).toContain('avoid vague style-only findings')
    expect(systemPrompt).not.toContain('unmarked memory')
  })
})
