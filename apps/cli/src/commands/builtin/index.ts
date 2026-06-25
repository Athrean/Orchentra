import { CommandRegistry } from '../registry'
import { HelpCommand } from './help'
import { StatusCommand } from './status'
import { CostCommand } from './cost'
import { ClearCommand } from './clear'
import { ModelCommand } from './model'
import { ThemeCommand } from './theme'
import { EffortCommand } from './effort'
import { CompactCommand } from './compact'
import { DiffCommand } from './diff'
import { VersionCommand } from './version'
import { ExitCommand } from './exit'
import { CommitCommand } from './commit'
import { PrCommand } from './pr'
import { IssueCommand } from './issue'
import { SessionCommand } from './session'
import { ConfigCommand } from './config'
import { PermissionsCommand } from './permissions'
import { McpCommand } from './mcp-cmd'
import { DoctorCommand } from './doctor-cmd'
import { ExportCommand } from './export'
import { ResumeCommand } from './resume'
import { LoginCommand } from './login'
import { LogoutCommand } from './logout'
import { ReauthCommand } from './reauth-slash'
import { AuthStatusCommand } from './auth-status'
import { SkillsCommand } from './skills-adapter'
import { RestartCommand } from './restart'
import { ScanSlashCommand } from './scan-slash'
import { InitSlashCommand } from './init-slash'
import { SearchCommand } from './search'
import { ReviewCommand } from './review'
import { PlanCommand } from './plan'
import { ThinkCommand } from './think'
import { TerseCommand } from './terse'
import { MemoryCommand, ForgetCommand } from './memory'
import { DebugCommand } from './debug'

export function createBuiltinRegistry(): CommandRegistry {
  const registry = new CommandRegistry()

  // Help needs the registry reference to list all commands
  registry.register(new HelpCommand(registry))
  registry.register(new StatusCommand())
  registry.register(new CostCommand())
  registry.register(new ClearCommand())
  registry.register(new ModelCommand())
  registry.register(new EffortCommand())
  registry.register(new ThemeCommand())
  registry.register(new CompactCommand())
  registry.register(new DiffCommand())
  registry.register(new VersionCommand())
  registry.register(new ExitCommand())
  registry.register(new CommitCommand())
  registry.register(new PrCommand())
  registry.register(new IssueCommand())
  registry.register(new SessionCommand())
  registry.register(new ConfigCommand())
  registry.register(new PermissionsCommand())
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

  // /scan — LLM code review (BYOK).
  registry.register(new ScanSlashCommand())

  // /init wraps the install orchestrator inside the REPL so users don't need
  // to exit and re-launch to onboard.
  registry.register(new InitSlashCommand())
  registry.register(new SearchCommand())
  registry.register(new ReviewCommand())
  registry.register(new PlanCommand())
  registry.register(new ThinkCommand())
  registry.register(new TerseCommand())

  // /memory + /forget — inspect and delete stored failure memories.
  registry.register(new MemoryCommand())
  registry.register(new ForgetCommand())

  // /debug — diagnose the latest failed run against stored failure memories.
  registry.register(new DebugCommand())

  return registry
}

export { CommandRegistry } from '../registry'
export type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
