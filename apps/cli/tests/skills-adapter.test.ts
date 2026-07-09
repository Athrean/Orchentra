import { describe, expect, test } from 'bun:test'
import type { ParsedSkill } from '@orchentra/cli-core'
import { CommandRegistry } from '../src/commands/registry'
import { registerSkillCommands } from '../src/commands/builtin/skills-adapter'
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
    meta: { name: 'hello', description: 'say hi' },
    ...overrides,
  }
}

describe('registerSkillCommands', () => {
  test('registers each skill as a slash command in the registry', () => {
    const registry = new CommandRegistry()
    registerSkillCommands(
      registry,
      [fixtureSkill({ name: 'hello' }), fixtureSkill({ name: 'deploy', description: 'ship it' })],
      {
        runTurn: async () => {},
      },
    )

    const names = registry
      .allSpecs()
      .map((s) => s.name)
      .sort()
    expect(names).toEqual(['deploy', 'hello'])
  })

  test('handler invokes runTurn with the skill body when executed', async () => {
    const registry = new CommandRegistry()
    let received: string | null = null
    registerSkillCommands(registry, [fixtureSkill()], {
      runTurn: async (text) => {
        received = text
      },
    })

    const resolved = registry.resolve('/hello')
    expect(resolved).not.toBeNull()
    if (resolved === null || resolved instanceof Error) throw new Error('expected handler')

    await resolved.handler.execute([], { cwd: '/', session: fakeSession })

    expect(received).toBe('Greet the user warmly.')
  })

  test('command summary surfaces the skill description', () => {
    const registry = new CommandRegistry()
    registerSkillCommands(registry, [fixtureSkill({ name: 'deploy', description: 'deploy a service' })], {
      runTurn: async () => {},
    })

    const spec = registry.allSpecs().find((s) => s.name === 'deploy')
    expect(spec?.summary).toBe('deploy a service')
  })

  test('substitutes positional and $ARGUMENTS placeholders before dispatch', async () => {
    const registry = new CommandRegistry()
    let received: string | null = null
    registerSkillCommands(
      registry,
      [
        fixtureSkill({
          name: 'deploy',
          description: 'd',
          body: 'Deploy $0 to $1 (raw: $ARGUMENTS)',
        }),
      ],
      {
        runTurn: async (text) => {
          received = text
        },
      },
    )

    const resolved = registry.resolve('/deploy api prod')
    if (resolved === null || resolved instanceof Error) throw new Error('expected handler')
    await resolved.handler.execute(['api', 'prod'], { cwd: '/', session: fakeSession })

    expect(received).toBe('Deploy api to prod (raw: api prod)')
  })

  test('forwards allowed-tools as a permissionOverlay to runTurn', async () => {
    const registry = new CommandRegistry()
    let receivedOverlay: unknown = 'unset'
    registerSkillCommands(
      registry,
      [fixtureSkill({ name: 'deploy', description: 'd', allowedTools: ['Bash(kubectl:*)'] })],
      {
        runTurn: async (_text, opts) => {
          receivedOverlay = opts?.permissionOverlay
        },
      },
    )

    const resolved = registry.resolve('/deploy')
    if (resolved === null || resolved instanceof Error) throw new Error('expected handler')
    await resolved.handler.execute([], { cwd: '/', session: fakeSession })

    expect(receivedOverlay).toEqual({ allow: ['Bash(kubectl:*)'], deny: [], ask: [] })
  })

  test('omits permissionOverlay when allowed-tools is empty', async () => {
    const registry = new CommandRegistry()
    let receivedOpts: unknown = 'unset'
    registerSkillCommands(registry, [fixtureSkill()], {
      runTurn: async (_text, opts) => {
        receivedOpts = opts
      },
    })

    const resolved = registry.resolve('/hello')
    if (resolved === null || resolved instanceof Error) throw new Error('expected handler')
    await resolved.handler.execute([], { cwd: '/', session: fakeSession })

    expect(receivedOpts).toBeUndefined()
  })
})
