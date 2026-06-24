import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ResumeCommand } from '../../src/commands/builtin/resume'
import type { CommandContext } from '../../src/commands/registry'
import type { SessionControl } from '@orchentra/cli-core'
import type { UiOutput } from '../../src/commands/ui-output'
import { fingerprintWorkspace } from '../../src/sessions/workspace-fingerprint'

let savedHome: string | undefined
let tmpHome: string

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'orchentra-resume-ws-'))
  savedHome = process.env['ORCHENTRA_HOME']
  process.env['ORCHENTRA_HOME'] = tmpHome
})

afterEach(() => {
  if (savedHome === undefined) delete process.env['ORCHENTRA_HOME']
  else process.env['ORCHENTRA_HOME'] = savedHome
  rmSync(tmpHome, { recursive: true, force: true })
})

function makeSession(): SessionControl {
  return {
    getModel: () => 'test-model',
    setModel: () => 'test-model',
    getPermissionMode: () => 'workspace-write',
    setPermissionMode: (m) => m,
    getSessionId: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    getTurns: () => 0,
    getUsage: () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }),
    clearHistory: () => {},
    forceCompact: () => {},
  }
}

function makeCtx(cwd: string): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  return { events, ctx: { cwd, session: makeSession(), ui: (o) => events.push(o) } }
}

function writeSession(bucketDir: string, id: string, lines: object[]): void {
  mkdirSync(bucketDir, { recursive: true })
  const body = lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
  writeFileSync(join(bucketDir, `${id}.jsonl`), body)
}

function sessionsRoot(): string {
  return join(tmpHome, '.orchentra', 'sessions')
}

function notes(events: UiOutput[]): string[] {
  return events.flatMap((e) => (e.kind === 'note' ? [e.text] : []))
}

describe('ResumeCommand workspace scope', () => {
  test('latest in workspace A is invisible to workspace B', async () => {
    const wsA = '/Users/foo/repo-a'
    const wsB = '/Users/foo/repo-b'

    // Write a session in A's bucket only.
    writeSession(join(sessionsRoot(), fingerprintWorkspace(wsA)), 'aaaa1111', [
      { event: { kind: 'text', delta: 'from-A' } },
    ])

    // Resume from B → not found.
    const { ctx, events } = makeCtx(wsB)
    await new ResumeCommand().execute(['latest'], ctx)
    expect(notes(events).join(' ')).toMatch(/No sessions found/)
  })

  test('latest in workspace A is visible from workspace A', async () => {
    const wsA = '/Users/foo/repo-a'
    writeSession(join(sessionsRoot(), fingerprintWorkspace(wsA)), 'aaaa1111', [
      { event: { kind: 'text', delta: 'hello-A' } },
    ])

    const { ctx, events } = makeCtx(wsA)
    await new ResumeCommand().execute(['latest'], ctx)
    const cards = events.filter((e) => e.kind === 'card')
    expect(cards.length).toBe(1)
    if (cards[0]!.kind !== 'card') throw new Error('expected card')
    expect(cards[0]!.subtitle).toContain('aaaa1111')
  })

  test('cross:<id> finds a session in a sibling workspace bucket', async () => {
    const wsA = '/Users/foo/repo-a'
    const wsB = '/Users/foo/repo-b'

    writeSession(join(sessionsRoot(), fingerprintWorkspace(wsA)), 'cccc2222', [
      { event: { kind: 'text', delta: 'cross-find' } },
    ])

    const { ctx, events } = makeCtx(wsB)
    await new ResumeCommand().execute(['cross:cccc2222'], ctx)
    const cards = events.filter((e) => e.kind === 'card')
    expect(cards.length).toBe(1)
    if (cards[0]!.kind !== 'card') throw new Error('expected card')
    expect(cards[0]!.subtitle).toContain('cccc2222')
  })

  test('cross:latest picks the newest session across every bucket', async () => {
    const wsA = '/Users/foo/repo-a'
    const wsB = '/Users/foo/repo-b'

    writeSession(join(sessionsRoot(), fingerprintWorkspace(wsA)), 'older', [{ event: { kind: 'text', delta: 'old' } }])
    // Make sure the second write has a later mtime.
    await new Promise((r) => setTimeout(r, 15))
    writeSession(join(sessionsRoot(), fingerprintWorkspace(wsB)), 'newer', [{ event: { kind: 'text', delta: 'new' } }])

    const { ctx, events } = makeCtx('/Users/foo/repo-c')
    await new ResumeCommand().execute(['cross:latest'], ctx)
    const cards = events.filter((e) => e.kind === 'card')
    if (cards[0]!.kind !== 'card') throw new Error('expected card')
    expect(cards[0]!.subtitle).toContain('newer')
  })

  test('non-cross "latest" never reaches another workspace bucket', async () => {
    const wsA = '/Users/foo/repo-a'
    const wsB = '/Users/foo/repo-b'
    writeSession(join(sessionsRoot(), fingerprintWorkspace(wsA)), 'aaa', [{ event: { kind: 'text', delta: 'a' } }])
    const { ctx, events } = makeCtx(wsB)
    await new ResumeCommand().execute(['latest'], ctx)
    expect(notes(events).join(' ')).toMatch(/No sessions found/)
  })
})
