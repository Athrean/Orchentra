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

function makeCtxWithSession(cwd: string, session: SessionControl): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  return { events, ctx: { cwd, session, ui: (o) => events.push(o) } }
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

  test('a non-id search argument matches a session by its content tag', async () => {
    const wsA = '/Users/foo/repo-a'
    writeSession(join(sessionsRoot(), fingerprintWorkspace(wsA)), 'zzzz9999', [
      { event: { kind: 'user_message', content: 'Refactor the theme picker overlay' } },
    ])
    writeSession(join(sessionsRoot(), fingerprintWorkspace(wsA)), 'yyyy8888', [
      { event: { kind: 'user_message', content: 'Add gitignore support' } },
    ])

    // "theme" is not an id prefix but is in the first session's tag.
    const { ctx, events } = makeCtx(wsA)
    await new ResumeCommand().execute(['theme'], ctx)

    const cards = events.filter((e) => e.kind === 'card')
    expect(cards.length).toBe(1)
    if (cards[0]!.kind !== 'card') throw new Error('expected card')
    expect(cards[0]!.subtitle).toContain('zzzz9999')
    expect(cards[0]!.subtitle).toContain('refactor-the-theme-picker')
  })

  test('the resume card surfaces the session tag', async () => {
    const wsA = '/Users/foo/repo-a'
    writeSession(join(sessionsRoot(), fingerprintWorkspace(wsA)), 'aaaa1111', [
      { event: { kind: 'user_message', content: 'Wire up the doctor checks' } },
    ])

    const { ctx, events } = makeCtx(wsA)
    await new ResumeCommand().execute(['latest'], ctx)

    const cards = events.filter((e) => e.kind === 'card')
    if (cards[0]!.kind !== 'card') throw new Error('expected card')
    const tagRow = cards[0]!.sections[0]!.rows.find((r) => r.key === 'Tag')
    expect(tagRow?.value).toBe('wire-up-the-doctor-checks')
  })

  test('resumes the matched session through the live session hook when available', async () => {
    const wsA = '/Users/foo/repo-a'
    const id = 'dddd3333'
    writeSession(join(sessionsRoot(), fingerprintWorkspace(wsA)), id, [
      { event: { kind: 'user_message', content: 'start' } },
      { event: { kind: 'text', delta: 'done' } },
    ])

    let resumedPath = ''
    const session: SessionControl = {
      ...makeSession(),
      resumeSession: async (path) => {
        resumedPath = path
        return {
          sessionId: id,
          path,
          cwd: wsA,
          model: 'test-model',
          events: 2,
          messages: 2,
          toolCalls: 0,
          contextComplete: true,
        }
      },
    }
    const { ctx, events } = makeCtxWithSession(wsA, session)

    await new ResumeCommand().execute([id], ctx)

    expect(resumedPath).toBe(join(sessionsRoot(), fingerprintWorkspace(wsA), `${id}.jsonl`))
    const cards = events.filter((e) => e.kind === 'card')
    expect(cards.length).toBe(1)
    if (cards[0]!.kind !== 'card') throw new Error('expected card')
    expect(cards[0]!.title).toBe('Resumed Session')
    expect(cards[0]!.subtitle).toContain(id)
  })

  test('continues an interrupted autonomous RunState after hydrating the session', async () => {
    const wsA = '/Users/foo/repo-a'
    const id = 'm4resume'
    writeSession(join(sessionsRoot(), fingerprintWorkspace(wsA)), id, [
      { event: { kind: 'user_message', content: 'fix it' } },
      { event: { kind: 'run_state', state: 'EXECUTE' } },
    ])

    let continuations = 0
    const session: SessionControl = {
      ...makeSession(),
      resumeSession: async (path) => ({
        sessionId: id,
        path,
        cwd: wsA,
        model: 'test-model',
        events: 2,
        messages: 1,
        toolCalls: 0,
        contextComplete: true,
      }),
      resumeAutonomousRun: async () => {
        continuations++
        return { ok: true, reason: 'stop' }
      },
    }
    const { ctx, events } = makeCtxWithSession(wsA, session)

    await new ResumeCommand().execute([id], ctx)

    expect(continuations).toBe(1)
    expect(notes(events)).toContain('Autonomous run resumed: stop.')
  })
})
