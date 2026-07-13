import { describe, expect, test } from 'bun:test'
import { InitSlashCommand } from '../src/commands/builtin/init-slash'
import type { CommandContext } from '../src/commands/registry'
import type { UiOutput } from '../src/commands/ui-output'

function context(): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  return {
    events,
    ctx: {
      cwd: '/repo',
      session: {} as CommandContext['session'],
      ui: (event) => events.push(event),
    },
  }
}

const report = {
  projectRoot: '/repo',
  artifacts: [
    { name: '.orchentra/', status: 'created' as const },
    { name: '.gitignore', status: 'updated' as const },
  ],
}

describe('/init', () => {
  test('initializes local repo without remote bootstrap', async () => {
    let loginCalled = false
    const command = new InitSlashCommand({
      initialize: () => report,
      hasGitHubToken: () => true,
      login: async () => {
        loginCalled = true
        return true
      },
    })
    const { ctx, events } = context()

    expect(await command.execute([], ctx)).toBe(true)
    expect(loginCalled).toBe(false)
    expect(events).toHaveLength(1)
    expect(events[0]?.kind).toBe('card')
    if (events[0]?.kind !== 'card') throw new Error('expected card')
    expect(events[0].sections[0]?.rows).toContainEqual({ key: 'GitHub', value: 'connected' })
  })

  test('routes missing GitHub auth to shared device-login service', async () => {
    const providers: string[] = []
    const command = new InitSlashCommand({
      initialize: () => report,
      hasGitHubToken: () => false,
      login: async (provider) => {
        providers.push(provider)
        return true
      },
    })
    const { ctx } = context()

    expect(await command.execute([], ctx)).toBe(true)
    expect(providers).toEqual(['github'])
  })

  test('rejects obsolete owner/server arguments', async () => {
    const command = new InitSlashCommand({ initialize: () => report })
    const { ctx, events } = context()

    expect(await command.execute(['--server', 'http://localhost'], ctx)).toBe(false)
    expect(events).toEqual([{ kind: 'note', tone: 'warn', text: 'Usage: /init — unknown argument: --server' }])
  })
})
