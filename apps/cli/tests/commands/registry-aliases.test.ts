import { describe, expect, test } from 'bun:test'
import { CommandRegistry, type CommandHandler } from '../../src/commands/registry'
import { TriageSlashCommand } from '../../src/commands/builtin/triage-slash'
import { SummarizeSlashCommand } from '../../src/commands/builtin/summarize-slash'
import { CleanSlashCommand } from '../../src/commands/builtin/clean-slash'
import { HelpCommand } from '../../src/commands/builtin/help'
import { ClearCommand } from '../../src/commands/builtin/clear'
import { LoginCommand } from '../../src/commands/builtin/login'
import { LogoutCommand } from '../../src/commands/builtin/logout'
import { DiffCommand } from '../../src/commands/builtin/diff'
import { ModelCommand } from '../../src/commands/builtin/model'
import { ThemeCommand } from '../../src/commands/builtin/theme'
import { StatusCommand } from '../../src/commands/builtin/status'
import { DoctorCommand } from '../../src/commands/builtin/doctor-cmd'
import { ConfigCommand } from '../../src/commands/builtin/config'
import { IssueCommand } from '../../src/commands/builtin/issue'
import { ReposSlashCommand } from '../../src/commands/builtin/repos-slash'
import { ExitCommand } from '../../src/commands/builtin/exit'

function buildRegistry(): CommandRegistry {
  const reg = new CommandRegistry()
  const handlers: CommandHandler[] = [
    new TriageSlashCommand(),
    new SummarizeSlashCommand(),
    new CleanSlashCommand(),
    new HelpCommand(reg),
    new ClearCommand(),
    new LoginCommand(),
    new LogoutCommand(),
    new DiffCommand(),
    new ModelCommand(),
    new ThemeCommand(),
    new StatusCommand(),
    new DoctorCommand(),
    new ConfigCommand(),
    new IssueCommand(),
    new ReposSlashCommand(),
    new ExitCommand(),
  ]
  for (const h of handlers) reg.register(h)
  return reg
}

describe('slash command aliases', () => {
  test('triage resolves via /t', () => {
    const reg = buildRegistry()
    const hit = reg.resolve('/t')
    expect(hit && !(hit instanceof Error)).toBe(true)
    if (hit && !(hit instanceof Error)) expect(hit.handler.spec.name).toBe('triage')
  })

  test('summarize resolves via /sum and /summary', () => {
    const reg = buildRegistry()
    for (const alias of ['/sum', '/summary']) {
      const hit = reg.resolve(alias)
      expect(hit && !(hit instanceof Error)).toBe(true)
      if (hit && !(hit instanceof Error)) expect(hit.handler.spec.name).toBe('summarize')
    }
  })

  test('help resolves via /h and /?', () => {
    const reg = buildRegistry()
    for (const alias of ['/h', '/?']) {
      const hit = reg.resolve(alias)
      expect(hit && !(hit instanceof Error)).toBe(true)
      if (hit && !(hit instanceof Error)) expect(hit.handler.spec.name).toBe('help')
    }
  })

  test('every alias survives a full registry build (no collisions)', () => {
    const reg = buildRegistry()
    const specs = reg.allSpecs()
    const seen = new Map<string, string>()
    for (const spec of specs) {
      for (const tok of [spec.name, ...spec.aliases]) {
        const owner = seen.get(tok)
        if (owner) throw new Error(`alias collision: '${tok}' on both /${owner} and /${spec.name}`)
        seen.set(tok, spec.name)
      }
    }
    expect(seen.size).toBeGreaterThan(specs.length)
  })

  test('common short aliases route to expected verbs', () => {
    const reg = buildRegistry()
    const expectations: Array<[string, string]> = [
      ['/cls', 'clear'],
      ['/li', 'login'],
      ['/lo', 'logout'],
      ['/d', 'diff'],
      ['/m', 'model'],
      ['/th', 'theme'],
      ['/st', 'status'],
      ['/doc', 'doctor'],
      ['/cfg', 'config'],
      ['/iss', 'issue'],
      ['/repo', 'repos'],
      ['/cleanup', 'clean'],
      ['/q', 'exit'],
    ]
    for (const [alias, expected] of expectations) {
      const hit = reg.resolve(alias)
      expect(hit && !(hit instanceof Error)).toBe(true)
      if (hit && !(hit instanceof Error)) expect(hit.handler.spec.name).toBe(expected)
    }
  })
})
