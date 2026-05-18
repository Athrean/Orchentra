/**
 * Integration: after `/init` succeeds, the next `/incident` invocation in
 * the same REPL session must pass the prereq middleware without a restart.
 * Acceptance criterion from #378.
 *
 * Uses real `writeProjectSettings` + `saveCredential` against a tmp cwd
 * and tmp `$ORCHENTRA_CONFIG_HOME`, so the prereq probe actually reads
 * disk state the orchestrator just wrote.
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
import { InitSlashCommand, type SlashBootstrapFn } from '../src/commands/builtin/init-slash'
import { withIncidentPrereq } from '../src/commands/builtin/incident-prereq'
import { defaultIncidentPrereq } from '../src/commands/builtin/incident-prereq-check'

function makeSession(): SessionControl {
  return {
    getModel: () => 'm',
    setModel: () => 'm',
    getPermissionMode: () => 'default',
    getSessionId: () => 'sess-int',
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

describe('/init then /incident — prereq passes without REPL restart', () => {
  let cwd: string
  let configHome: string
  let originalEnv: { home: string | undefined; orgId: string | undefined; apiKey: string | undefined }

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'init-then-incident-cwd-'))
    configHome = mkdtempSync(join(tmpdir(), 'init-then-incident-home-'))
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

  test('the prereq fails before /init and passes after /init writes settings + creds', async () => {
    // Stub bootstrap: skip network/loopback but persist the same artifacts
    // the real orchestrator would on success.
    const bootstrap: SlashBootstrapFn = async (input) => {
      const settingsPath = writeProjectSettings({ cwd: input.cwd, orgId: 'org-int', serverUrl: 'http://srv:9000' })
      const credentialPath = saveCredential('orchentra', { apiKey: 'orch_int_test_key' })
      return { ok: true, orgId: 'org-int', installationId: 42, settingsPath, credentialPath }
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
    registry.register(new InitSlashCommand({ bootstrap }))
    registry.register(withIncidentPrereq(innerIncident, defaultIncidentPrereq))

    // Step 1: /incident before /init — prereq fails, inner not called, card emitted.
    const eventsBefore: UiOutput[] = []
    const ctxBefore: CommandContext = { cwd, session: makeSession(), ui: (o) => eventsBefore.push(o) }
    const incidentBefore = registry.resolve('/incident')
    expect(incidentBefore).not.toBeNull()
    expect(incidentBefore).not.toBeInstanceOf(Error)
    const r1 = incidentBefore as { handler: CommandHandler; args: string[] }
    await r1.handler.execute(r1.args, ctxBefore)
    expect(innerCalls).toBe(0)
    expect(eventsBefore.some((e) => e.kind === 'card' && /prereqs missing/i.test(e.title ?? ''))).toBe(true)

    // Step 2: /init writes settings + creds.
    const eventsInit: UiOutput[] = []
    const ctxInit: CommandContext = { cwd, session: makeSession(), ui: (o) => eventsInit.push(o) }
    const initResolved = registry.resolve('/init --owner Athrean')
    expect(initResolved).not.toBeNull()
    expect(initResolved).not.toBeInstanceOf(Error)
    const ri = initResolved as { handler: CommandHandler; args: string[] }
    const initOk = await ri.handler.execute(ri.args, ctxInit)
    expect(initOk).toBe(true)

    // Step 3: /incident after /init — prereq passes, inner called once.
    const eventsAfter: UiOutput[] = []
    const ctxAfter: CommandContext = { cwd, session: makeSession(), ui: (o) => eventsAfter.push(o) }
    const incidentAfter = registry.resolve('/incident')
    const r3 = incidentAfter as { handler: CommandHandler; args: string[] }
    await r3.handler.execute(r3.args, ctxAfter)
    expect(innerCalls).toBe(1)
  })
})
