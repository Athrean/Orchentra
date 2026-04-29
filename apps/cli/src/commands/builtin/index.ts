import { CommandRegistry } from '../registry'
import { HelpCommand } from './help'
import { StatusCommand } from './status'
import { CostCommand } from './cost'
import { ClearCommand } from './clear'
import { ModelCommand } from './model'
import { CompactCommand } from './compact'
import { DiffCommand } from './diff'
import { VersionCommand } from './version'
import { ExitCommand } from './exit'
import { CommitCommand } from './commit'
import { PrCommand } from './pr'
import { IssueCommand } from './issue'
import { SessionCommand } from './session'
import { ConfigCommand } from './config'
import { McpCommand } from './mcp-cmd'
import { DoctorCommand } from './doctor-cmd'
import { ExportCommand } from './export'
import { ResumeCommand } from './resume'
import { LoginCommand } from './login'
import { LogoutCommand } from './logout'
import { AuthStatusCommand } from './auth-status'
import { createServerCommand } from './server-bridge'
import { SkillsCommand } from './skills-adapter'
import { RestartCommand } from './restart'
import { createGraphCommand } from './graph'

export function createBuiltinRegistry(): CommandRegistry {
  const registry = new CommandRegistry()

  // Help needs the registry reference to list all commands
  registry.register(new HelpCommand(registry))
  registry.register(new StatusCommand())
  registry.register(new CostCommand())
  registry.register(new ClearCommand())
  registry.register(new ModelCommand())
  registry.register(new CompactCommand())
  registry.register(new DiffCommand())
  registry.register(new VersionCommand())
  registry.register(new ExitCommand())
  // Phase B
  registry.register(new CommitCommand())
  registry.register(new PrCommand())
  registry.register(new IssueCommand())
  registry.register(new SessionCommand())
  registry.register(new ConfigCommand())
  registry.register(new McpCommand())
  registry.register(new DoctorCommand())
  registry.register(new ExportCommand())
  registry.register(new ResumeCommand())
  // Auth
  registry.register(new LoginCommand())
  registry.register(new LogoutCommand())
  registry.register(new AuthStatusCommand())

  // Skills meta-command (lists user-authored skills + load errors)
  registry.register(new SkillsCommand())

  // Re-exec the CLI to pick up code/config changes (dev workflow)
  registry.register(new RestartCommand())

  // Phase 3: graph + lineage browsers
  registry.register(createGraphCommand())

  // Server-bridge: route to POST /api/orgs/:orgId/commands
  registry.register(
    createServerCommand(
      {
        name: 'incidents',
        aliases: ['inc'],
        summary: 'List incidents from the Orchentra server',
        argumentHint: '<filters>',
      },
      'status',
    ),
  )
  registry.register(
    createServerCommand(
      {
        name: 'triage',
        aliases: [],
        summary: 'Trigger triage for a workflow run via the server',
        argumentHint: '<id|owner/repo> [run-id]',
      },
      'triage',
    ),
  )
  registry.register(
    createServerCommand(
      {
        name: 'retry',
        aliases: [],
        summary: 'Re-enqueue an errored or dismissed incident',
        argumentHint: '<id>',
      },
      'retry',
    ),
  )
  registry.register(
    createServerCommand(
      {
        name: 'explain',
        aliases: [],
        summary: 'Plain-English summary of a stored incident brief',
        argumentHint: '<id>',
      },
      'explain',
    ),
  )

  return registry
}

export { CommandRegistry } from '../registry'
export type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
