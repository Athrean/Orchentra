/**
 * Slice 6 tracer-bullet (#380): the regression captured in PRD #374's
 * screenshot. `/incident` should fail on missing config, the bootstrap
 * prompt should accept, the orchestrator should run against a fake
 * Orchentra server + fake browser callback, and the *next* `/incident`
 * invocation should pass the prereq middleware and reach the inner
 * handler — all inside the same REPL session, no restart.
 *
 * The slice 5 `IncidentBootstrapHook` seam is what makes this end-to-end
 * possible: we inject a stub prompter (always Y) and a stub orchestrator
 * that calls `writeProjectSettings` + `saveCredential` against tmp paths
 * the prereq probe will then read on the second pass.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveCredential, writeProjectSettings } from '@orchentra/cli-api'
import { CommandRegistry } from '../src/commands/registry'
import type { CommandContext, CommandHandler } from '../src/commands/registry'
import type { UiOutput } from '../src/commands/ui-output'
import type { SessionControl } from '@orchentra/cli-core'
import { withIncidentPrereq, type IncidentBootstrapHook } from '../src/commands/builtin/incident-prereq'
import { defaultIncidentPrereq } from '../src/commands/builtin/incident-prereq-check'

function makeSession(): SessionControl {
  return {
    getModel: () => 'm',
    setModel: () => 'm',
    getPermissionMode: () => 'default',
    getSessionId: () => 'sess-tracer',
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

describe('/incident → bootstrap-prompt accept → /incident succeeds (PRD #374)', () => {
  let cwd: string
  let configHome: string
  let originalEnv: { home: string | undefined; orgId: string | undefined; apiKey: string | undefined }

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'incident-after-bootstrap-cwd-'))
    configHome = mkdtempSync(join(tmpdir(), 'incident-after-bootstrap-home-'))
    originalEnv = {
      home: process.env.ORCHENTRA_CONFIG_HOME,
      orgId: process.env.ORCHENTRA_ORG_ID,
      apiKey: process.env.ORCHENTRA_API_KEY,
    }
    process.env.ORCHENTRA_CONFIG_HOME = configHome
    delete process.env.ORCHENTRA_ORG_ID
    delete process.env.ORCHENTRA_API_KEY
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
    rmSync(configHome, { recursive: true, force: true })
    if (originalEnv.home === undefined) delete process.env.ORCHENTRA_CONFIG_HOME
    else process.env.ORCHENTRA_CONFIG_HOME = originalEnv.home
    if (originalEnv.orgId !== undefined) process.env.ORCHENTRA_ORG_ID = originalEnv.orgId
    if (originalEnv.apiKey !== undefined) process.env.ORCHENTRA_API_KEY = originalEnv.apiKey
  })

  test('missing config → Y prompt → orchestrator → retry passes prereq, inner handler runs', async () => {
    // Stubbed bootstrap hook: prompts always accept, orchestrator persists
    // the same artifacts a real successful install would (settings.json +
    // keychain api-key) so the second prereq probe finds them on disk.
    let promptCalls = 0
    let runCalls = 0
    const hook: IncidentBootstrapHook = {
      async promptBootstrap(_ctx: CommandContext): Promise<boolean> {
        promptCalls++
        return true
      },
      async runBootstrap(ctxArg: CommandContext): Promise<void> {
        runCalls++
        writeProjectSettings({ cwd: ctxArg.cwd, orgId: 'org-tracer', serverUrl: 'http://srv:9000' })
        saveCredential('orchentra', { apiKey: 'orch_tracer_test_key' })
      },
    }

    let innerCalls = 0
    const innerIncident: CommandHandler = {
      spec: { name: 'incident', aliases: [], summary: 's' },
      async execute(): Promise<boolean> {
        innerCalls++
        return true
      },
    }

    const registry = new CommandRegistry()
    registry.register(withIncidentPrereq(innerIncident, defaultIncidentPrereq, hook))

    // Single `/incident` invocation: prereq fails → prompt → orchestrator
    // → re-check passes → wrapped handler runs. All in one call.
    const events: UiOutput[] = []
    const ctx: CommandContext = { cwd, session: makeSession(), ui: (o) => events.push(o) }
    const resolved = registry.resolve('/incident')
    expect(resolved).not.toBeNull()
    expect(resolved).not.toBeInstanceOf(Error)
    const r = resolved as { handler: CommandHandler; args: string[] }
    await r.handler.execute(r.args, ctx)

    expect(promptCalls).toBe(1)
    expect(runCalls).toBe(1)
    expect(innerCalls).toBe(1)
    // No "prereqs missing" card should have rendered — the second check passed.
    const missingCard = events.find((e) => e.kind === 'card' && /prereqs missing/i.test(e.title ?? ''))
    expect(missingCard).toBeUndefined()
  })

  test('missing config → N prompt → falls back to tabular menu, inner not called', async () => {
    const hook: IncidentBootstrapHook = {
      async promptBootstrap(): Promise<boolean> {
        return false
      },
      async runBootstrap(): Promise<void> {
        throw new Error('should not run when user declines')
      },
    }

    let innerCalls = 0
    const innerIncident: CommandHandler = {
      spec: { name: 'incident', aliases: [], summary: 's' },
      async execute(): Promise<boolean> {
        innerCalls++
        return true
      },
    }

    const registry = new CommandRegistry()
    registry.register(withIncidentPrereq(innerIncident, defaultIncidentPrereq, hook))

    const events: UiOutput[] = []
    const ctx: CommandContext = { cwd, session: makeSession(), ui: (o) => events.push(o) }
    const r = registry.resolve('/incident') as { handler: CommandHandler; args: string[] }
    await r.handler.execute(r.args, ctx)

    expect(innerCalls).toBe(0)
    const missingCard = events.find((e) => e.kind === 'card' && /prereqs missing/i.test(e.title ?? ''))
    expect(missingCard).toBeDefined()
  })
})
