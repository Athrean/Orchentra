/**
 * Shared stubs for slash-command tests.
 *
 * `SessionControl` has nine required members, so every command test that needs
 * one was rebuilding the same nine-field object before adding the one or two
 * members it actually cared about. These helpers own the required base; each
 * test supplies only what it asserts on.
 *
 * Defaults are deliberately bland placeholders. A test that asserts on a value
 * must pass it explicitly rather than lean on the default, so that changing a
 * default here can never silently change what a test claims to prove.
 */

import type { CommandContext } from '../../src/commands/registry'
import type { SessionControl, UsageTotals } from '@orchentra/cli-core'
import type { UiOutput } from '../../src/commands/ui-output'

export const ZERO_USAGE: UsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
}

export function makeSessionControl(overrides: Partial<SessionControl> = {}): SessionControl {
  return {
    getModel: () => 'm',
    setModel: (model) => model,
    getPermissionMode: () => 'workspace-write',
    setPermissionMode: (mode) => mode,
    getSessionId: () => 's',
    getTurns: () => 0,
    getUsage: () => ZERO_USAGE,
    clearHistory: () => {},
    forceCompact: () => {},
    ...overrides,
  }
}

/**
 * A CommandContext wired to an event sink, which is how every command test
 * observes output. Returns the sink alongside the context.
 */
export function makeCommandCtx(
  session: SessionControl = makeSessionControl(),
  cwd = '/work',
): { ctx: CommandContext; events: UiOutput[]; session: SessionControl } {
  const events: UiOutput[] = []
  return { session, events, ctx: { cwd, session, ui: (o) => events.push(o) } }
}
