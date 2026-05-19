import { CommandRegistry } from '../registry'
import { HelpCommand } from './help'
import { StatusCommand } from './status'
import { CostCommand } from './cost'
import { ClearCommand } from './clear'
import { ModelCommand } from './model'
import { ThemeCommand } from './theme'
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
import { ReauthCommand } from './reauth-slash'
import { AuthStatusCommand } from './auth-status'
import { createServerCommand } from './server-bridge'
import { withIncidentPrereq } from './incident-prereq'
import { defaultIncidentPrereq } from './incident-prereq-check'
import { defaultIncidentBootstrapHook } from './incident-prereq-bootstrap'
import { SkillsCommand } from './skills-adapter'
import { RestartCommand } from './restart'
import { createGraphCommand } from './graph'
import { createWhyCommand } from './why'
import { SummarizeSlashCommand } from './summarize-slash'
import { TriageSlashCommand } from './triage-slash'
import { CleanSlashCommand } from './clean-slash'
import { EnvSlashCommand } from './env-slash'
import { ScanSlashCommand } from './scan-slash'
import { InitSlashCommand } from './init-slash'
import { ReposSlashCommand } from './repos-slash'
import { registerAllOpsAsSlash } from '../../op-commands/wire'

export function createBuiltinRegistry(): CommandRegistry {
  const registry = new CommandRegistry()

  // Help needs the registry reference to list all commands
  registry.register(new HelpCommand(registry))
  registry.register(new StatusCommand())
  registry.register(new CostCommand())
  registry.register(new ClearCommand())
  registry.register(new ModelCommand())
  registry.register(new ThemeCommand())
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
  registry.register(new ReauthCommand())
  registry.register(new AuthStatusCommand())

  // Skills meta-command (lists user-authored skills + load errors)
  registry.register(new SkillsCommand())

  // Re-exec the CLI to pick up code/config changes (dev workflow)
  registry.register(new RestartCommand())

  // Phase 3: graph + lineage browsers
  registry.register(createGraphCommand())
  registry.register(createWhyCommand())

  // Server-bridge: route to POST /api/orgs/:orgId/commands
  // Flow 2: command renamed `incidents` -> `incident` (singular). The plural
  // form stays as a compat alias for one release. The prereq middleware is
  // applied to `/incident` ONLY — `/retry` and `/explain` below keep their
  // existing raw-streaming behaviour.
  registry.register(
    withIncidentPrereq(
      createServerCommand(
        {
          name: 'incident',
          aliases: ['incidents', 'inc'],
          summary: 'List incidents from the Orchentra server',
          argumentHint: '<filters>',
        },
        'status',
      ),
      defaultIncidentPrereq,
      defaultIncidentBootstrapHook,
    ),
  )
  // Slice G: local /triage wraps runTriage. Replaces the server-bridged
  // /triage so the slash form and the shell verb hit the same workflow.
  registry.register(new TriageSlashCommand())

  // Flow 3: /summarize — root cause / where / fix from a failing run.
  // Run-spec only (owner/repo#runId). Free-form text rejected by design.
  registry.register(new SummarizeSlashCommand())

  // Slice I: /clean prunes expired Actions artifacts from old failed runs.
  registry.register(new CleanSlashCommand())

  // Slice J: /env list|set|sync — manage GH Actions secrets.
  registry.register(new EnvSlashCommand())

  // Slice K: /scan — LLM code review (BYOK).
  registry.register(new ScanSlashCommand())

  // Bootstrap slice 4: /init wraps the install orchestrator inside the REPL
  // so users don't need to exit and re-launch to onboard.
  registry.register(new InitSlashCommand())

  // Org-wide repo view: lists every repo the signed-in installation can
  // see, tagged with installed/monitored flags so the user can pick a
  // repo before running repo-scoped verbs.
  registry.register(new ReposSlashCommand())
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

  // Walk the operations registry and register every op as `/<op_id>`. Throws
  // on collision with any builtin command name above so a bad op id cannot
  // silently shadow `/help` or `/status`.
  registerAllOpsAsSlash(registry)

  return registry
}

export { CommandRegistry } from '../registry'
export type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
