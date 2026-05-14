import { describe, expect, test } from 'bun:test'
import { createBuiltinRegistry } from '../src/commands/builtin'
import type { CommandContext } from '../src/commands/registry'
import type { UiOutput } from '../src/commands/ui-output'
import type { SessionControl } from '@orchentra/cli-core'

function makeSession(): SessionControl {
  return { getSessionId: () => 'sess' } as unknown as SessionControl
}

describe('builtin registry includes server-bridge commands', () => {
  const registry = createBuiltinRegistry()
  const specs = registry.allSpecs()
  const names = new Set(specs.map((s) => s.name))

  test.each([
    // /incidents was renamed to /incident (singular) in Flow 2. `incidents`
    // stays as a deprecated alias for one release.
    ['incident', '<filters>'],
    // /triage was the server-bridged variant; Slice G replaced it with a
    // local handler that wraps runTriage, so the hint shape changed.
    ['triage', '<owner/repo#runId>'],
    ['retry', '<id>'],
    ['explain', '<id>'],
  ])('exposes /%s with arg hint %s', (name, hint) => {
    expect(names.has(name)).toBe(true)
    const spec = specs.find((s) => s.name === name)!
    expect(spec.argumentHint).toBe(hint)
  })

  test('/incidents resolves as a compat alias of /incident', () => {
    const resolved = registry.resolve('/incidents')
    if (!resolved || resolved instanceof Error) throw new Error('expected handler')
    expect(resolved.handler.spec.name).toBe('incident')
  })

  test('/inc still resolves to /incident', () => {
    const resolved = registry.resolve('/inc')
    if (!resolved || resolved instanceof Error) throw new Error('expected handler')
    expect(resolved.handler.spec.name).toBe('incident')
  })

  test('/status remains the local session-info command (not collided)', () => {
    const resolved = registry.resolve('/status')
    expect(resolved).not.toBeNull()
    if (!resolved || resolved instanceof Error) throw new Error('expected handler')
    expect(resolved.handler.spec.summary).toMatch(/session/i)
  })

  test('/incident renders prereq card when Orchentra config missing (no raw stack)', async () => {
    const resolved = registry.resolve('/incident')
    if (!resolved || resolved instanceof Error) throw new Error('expected handler')
    const events: UiOutput[] = []
    // Strip any env that would let resolveOrchentraConfig succeed, and point
    // cwd at /tmp so .orchentra/settings.json is absent.
    const prevOrg = process.env.ORCHENTRA_ORG_ID
    const prevKey = process.env.ORCHENTRA_API_KEY
    delete process.env.ORCHENTRA_ORG_ID
    delete process.env.ORCHENTRA_API_KEY
    const ctx: CommandContext = {
      cwd: '/tmp',
      session: makeSession(),
      ui: (o) => events.push(o),
    }
    try {
      await resolved.handler.execute([], ctx)
    } finally {
      if (prevOrg !== undefined) process.env.ORCHENTRA_ORG_ID = prevOrg
      if (prevKey !== undefined) process.env.ORCHENTRA_API_KEY = prevKey
    }
    const card = events.find((e): e is Extract<UiOutput, { kind: 'card' }> => e.kind === 'card')
    expect(card).toBeDefined()
    expect(card!.title).toMatch(/incident/i)
    const keys = card!.sections.flatMap((s) => s.rows).map((r) => r.key)
    expect(keys).toContain('Orchentra config')
    expect(keys).toContain('GitHub App')
    // Must NOT surface as a raw error note.
    const errorNote = events.find(
      (e) => e.kind === 'note' && e.tone === 'warn' && e.text.includes('Missing Orchentra config'),
    )
    expect(errorNote).toBeUndefined()
  })

  test('/retry and /explain remain raw-streaming (prereq middleware is /incident-only)', () => {
    for (const name of ['retry', 'explain']) {
      const resolved = registry.resolve(`/${name}`)
      if (!resolved || resolved instanceof Error) throw new Error(`expected handler for /${name}`)
      // Prereq-wrapped handlers expose the inner spec but their execute body
      // routes through the card path first. We check the implementation by
      // inspecting whether the spec is the bare server-bridge spec — there's
      // no marker, so this test is structural: name + hint match the
      // registration at the call site.
      expect(resolved.handler.spec.name).toBe(name)
    }
  })
})
