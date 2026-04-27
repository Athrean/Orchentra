import { describe, expect, test, beforeEach } from 'bun:test'
import type { ParsedSkill, SkillLoadError } from '@orchentra/cli-core'
import { CommandRegistry } from '../src/commands/registry'
import { registerSkillCommands, recordLoadErrors, SkillsCommand } from '../src/commands/builtin/skills-adapter'
import type { CommandContext } from '../src/commands/registry'

const fakeSession = {} as CommandContext['session']

function fixtureSkill(overrides: Partial<ParsedSkill> = {}): ParsedSkill {
  return {
    name: 'hello',
    description: 'say hi',
    body: 'Greet the user warmly.',
    source: '/tmp/skills/hello/SKILL.md',
    allowedTools: [],
    argumentNames: [],
    disableModelInvocation: false,
    meta: { name: 'hello', description: 'say hi' },
    ...overrides,
  }
}

beforeEach(() => {
  // Reset module-level caches between tests by re-registering empty.
  recordLoadErrors([])
})

describe('SkillsCommand', () => {
  test('lists every loaded skill via the UI sink', async () => {
    const registry = new CommandRegistry()
    registerSkillCommands(
      registry,
      [
        fixtureSkill({ name: 'hello', description: 'say hi', source: '/ws/hello/SKILL.md' }),
        fixtureSkill({ name: 'deploy', description: 'ship it', source: '/ws/deploy/SKILL.md' }),
      ],
      { runTurn: async () => {} },
    )
    recordLoadErrors([])

    const command = new SkillsCommand()
    let captured: { kind: string; title?: string; subtitle?: string; rowKeys: string[] } | null = null
    const ui = (output: {
      kind: string
      title?: string
      subtitle?: string
      sections?: { rows: { key: string }[] }[]
    }): void => {
      captured = {
        kind: output.kind,
        title: output.title,
        subtitle: output.subtitle,
        rowKeys: output.sections?.[0]?.rows.map((r) => r.key) ?? [],
      }
    }

    await command.execute([], { cwd: '/', session: fakeSession, ui: ui as never })
    expect(captured).not.toBeNull()
    expect(captured!.kind).toBe('card')
    expect(captured!.subtitle).toContain('2 loaded')
    expect(captured!.rowKeys.sort()).toEqual(['deploy', 'hello'])
  })

  test('renders empty state when no skills loaded', async () => {
    const registry = new CommandRegistry()
    registerSkillCommands(registry, [], { runTurn: async () => {} })
    recordLoadErrors([])

    const command = new SkillsCommand()
    let captured: { subtitle?: string } | null = null
    const ui = (output: { subtitle?: string }): void => {
      captured = { subtitle: output.subtitle }
    }

    await command.execute([], { cwd: '/', session: fakeSession, ui: ui as never })
    expect(captured!.subtitle).toContain('0 loaded')
  })

  test('surfaces load errors when they exist', async () => {
    const registry = new CommandRegistry()
    registerSkillCommands(registry, [fixtureSkill()], { runTurn: async () => {} })
    const errs: SkillLoadError[] = [
      { path: '/tmp/skills/broken/SKILL.md', message: 'missing description', field: 'description' },
    ]
    recordLoadErrors(errs)

    const command = new SkillsCommand()
    let captured: { sections: { rows: { key: string; value: string }[] }[] } | null = null
    const ui = (output: { sections: { rows: { key: string; value: string }[] }[] }): void => {
      captured = output as never
    }

    await command.execute([], { cwd: '/', session: fakeSession, ui: ui as never })
    const allRows = captured!.sections.flatMap((s) => s.rows)
    const errRow = allRows.find((r) => r.key.includes('broken'))
    expect(errRow).toBeDefined()
    expect(errRow!.value).toContain('missing description')
  })
})
