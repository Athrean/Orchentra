import { describe, expect, test } from 'bun:test'
import { PermissionsCommand } from '../src/commands/builtin/permissions'
import type { CommandContext } from '../src/commands/registry'
import type { PermissionMode, PolicyRule, SessionControl, StoredPermissionRule, UsageTotals } from '@orchentra/cli-core'
import type { UiOutput } from '../src/commands/ui-output'

function makeSession(
  initial: PermissionMode = 'workspace-write',
  opts: {
    permissionRules?: readonly PolicyRule[]
    storedRules?: readonly StoredPermissionRule[]
  } = {},
): {
  session: SessionControl
  calls: PermissionMode[]
} {
  let mode = initial
  const calls: PermissionMode[] = []
  const usage: UsageTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  const session: SessionControl = {
    getModel: () => 'm',
    setModel: () => 'm',
    getPermissionMode: () => mode,
    setPermissionMode: (x: PermissionMode) => {
      mode = x
      calls.push(x)
      return x
    },
    getSessionId: () => 's',
    getTurns: () => 0,
    getUsage: () => usage,
    listPermissionRules: opts.permissionRules ? () => opts.permissionRules ?? [] : undefined,
    listStoredPermissionRules: opts.storedRules ? () => opts.storedRules ?? [] : undefined,
    clearHistory: () => {},
    forceCompact: () => {},
  }
  return { session, calls }
}

function makeCtx(session: SessionControl): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  return { events, ctx: { cwd: '/w', session, ui: (o) => events.push(o) } }
}

describe('PermissionsCommand', () => {
  test('no arg shows the active mode and the full mode list', async () => {
    const { session } = makeSession('workspace-write')
    const { ctx, events } = makeCtx(session)
    await new PermissionsCommand().execute([], ctx)

    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    const text = JSON.stringify(ev)
    expect(text).toContain('workspace-write')
    expect(text).toContain('read-only')
    expect(text).toContain('danger-full-access')
  })

  test('no arg shows resolved allow, deny, and ask rules when available', async () => {
    const { session } = makeSession('workspace-write', {
      permissionRules: [
        { decision: 'allow', tool: 'bash', pattern: 'git status*' },
        { decision: 'deny', tool: 'bash', pattern: 'rm -rf*' },
        { decision: 'ask', tool: 'github_create_pr', pattern: '*' },
      ],
      storedRules: [{ decision: 'allow', tool: 'bash', pattern: 'bun test*', addedAt: '2026-06-24T00:00:00.000Z' }],
    })
    const { ctx, events } = makeCtx(session)
    await new PermissionsCommand().execute([], ctx)

    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    const text = JSON.stringify(ev)
    expect(text).toContain('allow')
    expect(text).toContain('bash git status*')
    expect(text).toContain('deny')
    expect(text).toContain('bash rm -rf*')
    expect(text).toContain('ask')
    expect(text).toContain('github_create_pr *')
    expect(text).toContain('remembered allow')
    expect(text).toContain('bash bun test*')
  })

  test('a valid mode arg switches the active mode', async () => {
    const { session, calls } = makeSession('workspace-write')
    const { ctx, events } = makeCtx(session)
    await new PermissionsCommand().execute(['read-only'], ctx)

    expect(calls).toEqual(['read-only'])
    expect(JSON.stringify(events[0])).toContain('read-only')
  })

  test('an invalid mode arg does not switch and reports the valid modes', async () => {
    const { session, calls } = makeSession('workspace-write')
    const { ctx, events } = makeCtx(session)
    await new PermissionsCommand().execute(['bogus'], ctx)

    expect(calls).toEqual([])
    const ev = events[0]
    if (ev.kind !== 'note') throw new Error('expected note')
    expect(ev.text).toContain('invalid permission mode')
    expect(ev.text).toContain('workspace-write')
  })
})
