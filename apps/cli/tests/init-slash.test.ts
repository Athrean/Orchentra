/**
 * Boundary tests for the `/init` slash command (slice 4 of #374).
 *
 * Routes `/init` through the command registry the REPL uses, with the
 * bootstrap orchestrator stubbed via the constructor seam. Asserts:
 *  - the orchestrator was invoked with the resolved owner/serverUrl,
 *  - progress callbacks render as a card with the expected steps,
 *  - the final state is a success or failure card (no raw stack traces),
 *  - failure returns `false` so the REPL prompt re-renders cleanly.
 */

import { describe, expect, test } from 'bun:test'
import { CommandRegistry } from '../src/commands/registry'
import type { CommandContext } from '../src/commands/registry'
import type { UiOutput } from '../src/commands/ui-output'
import type { SessionControl } from '@orchentra/cli-core'
import { InitSlashCommand, type SlashBootstrapFn } from '../src/commands/builtin/init-slash'

function makeSession(): SessionControl {
  return {
    getModel: () => 'm',
    setModel: () => 'm',
    getPermissionMode: () => 'default',
    getSessionId: () => 'sess-init',
    getTurns: () => 0,
    getUsage: () => ({
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
    }),
    clearHistory: () => {},
    forceCompact: () => {},
  } as unknown as SessionControl
}

function cards(events: UiOutput[]): Array<Extract<UiOutput, { kind: 'card' }>> {
  return events.filter((e): e is Extract<UiOutput, { kind: 'card' }> => e.kind === 'card')
}

describe('/init slash command — registry routing + progress card', () => {
  test('routes through the registry to InitSlashCommand', async () => {
    let invoked = false
    const bootstrap: SlashBootstrapFn = async () => {
      invoked = true
      return {
        ok: true,
        orgId: 'org-1',
        installationId: 99,
        settingsPath: '/tmp/.orchentra/settings.json',
        credentialPath: '/tmp/keychain/orchentra.json',
      }
    }
    const registry = new CommandRegistry()
    registry.register(new InitSlashCommand({ bootstrap }))
    const resolved = registry.resolve('/init --owner Athrean')
    expect(resolved).not.toBeNull()
    expect(resolved).not.toBeInstanceOf(Error)
    const { handler, args } = resolved as {
      handler: { execute: (a: string[], c: CommandContext) => Promise<boolean> }
      args: string[]
    }
    const events: UiOutput[] = []
    const ok = await handler.execute(args, { cwd: '/work', session: makeSession(), ui: (o) => events.push(o) })
    expect(ok).toBe(true)
    expect(invoked).toBe(true)
  })

  test('emits a progress card with probing / waiting / bootstrapped steps', async () => {
    const bootstrap: SlashBootstrapFn = async (opts) => {
      opts.onProgress?.('probing install state…')
      opts.onProgress?.('waiting for browser…')
      return {
        ok: true,
        orgId: 'org-1',
        installationId: 99,
        settingsPath: '/tmp/settings.json',
        credentialPath: '/tmp/keychain.json',
      }
    }
    const events: UiOutput[] = []
    const cmd = new InitSlashCommand({ bootstrap })
    const ok = await cmd.execute(['--owner', 'Athrean'], {
      cwd: '/work',
      session: makeSession(),
      ui: (o) => events.push(o),
    })
    expect(ok).toBe(true)
    const all = cards(events)
    expect(all.length).toBeGreaterThanOrEqual(1)
    const dump = all.flatMap((c) => c.sections.flatMap((s) => s.rows.map((r) => `${r.key}=${r.value}`))).join('\n')
    expect(dump).toContain('probing install state…')
    expect(dump).toContain('waiting for browser…')
    expect(dump).toMatch(/bootstrapped/i)
  })

  test('passes resolved owner + serverUrl into the orchestrator', async () => {
    const calls: Array<{ owner: string; serverUrl?: string; cwd: string }> = []
    const bootstrap: SlashBootstrapFn = async (opts) => {
      calls.push({ owner: opts.owner, serverUrl: opts.serverUrl, cwd: opts.cwd })
      return {
        ok: true,
        orgId: 'org-x',
        installationId: 1,
        settingsPath: 's',
        credentialPath: 'c',
      }
    }
    const cmd = new InitSlashCommand({ bootstrap })
    await cmd.execute(['--owner', 'Acme', '--server', 'http://srv:9000'], {
      cwd: '/repo',
      session: makeSession(),
      ui: () => {},
    })
    expect(calls).toEqual([{ owner: 'Acme', serverUrl: 'http://srv:9000', cwd: '/repo' }])
  })

  test('renders a failure card (no raw stack) when the orchestrator returns ok:false', async () => {
    const bootstrap: SlashBootstrapFn = async () => ({ ok: false, error: 'callback timed out after 5m' })
    const events: UiOutput[] = []
    const cmd = new InitSlashCommand({ bootstrap })
    const ok = await cmd.execute(['--owner', 'Athrean'], {
      cwd: '/work',
      session: makeSession(),
      ui: (o) => events.push(o),
    })
    expect(ok).toBe(false)
    const all = cards(events)
    expect(all.length).toBeGreaterThanOrEqual(1)
    const dump = all.flatMap((c) => c.sections.flatMap((s) => s.rows.map((r) => `${r.key}=${r.value}`))).join('\n')
    expect(dump).toContain('callback timed out after 5m')
  })

  test('rejects when neither --owner nor inferable origin is provided', async () => {
    let invoked = false
    const bootstrap: SlashBootstrapFn = async () => {
      invoked = true
      return { ok: false, error: 'should not run' }
    }
    const events: UiOutput[] = []
    const cmd = new InitSlashCommand({
      bootstrap,
      inferOwner: () => null,
    })
    const ok = await cmd.execute([], { cwd: '/work', session: makeSession(), ui: (o) => events.push(o) })
    expect(ok).toBe(false)
    expect(invoked).toBe(false)
    const notes = events.filter((e) => e.kind === 'note')
    expect(notes.length).toBeGreaterThanOrEqual(1)
  })

  test('defaults to inferred owner when --owner is omitted', async () => {
    const calls: string[] = []
    const bootstrap: SlashBootstrapFn = async (opts) => {
      calls.push(opts.owner)
      return { ok: true, orgId: 'o', installationId: 1, settingsPath: 's', credentialPath: 'c' }
    }
    const cmd = new InitSlashCommand({
      bootstrap,
      inferOwner: () => 'InferredOwner',
    })
    await cmd.execute([], { cwd: '/work', session: makeSession(), ui: () => {} })
    expect(calls).toEqual(['InferredOwner'])
  })
})
