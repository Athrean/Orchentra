import { resolveOrchentraConfig, type OrchentraConfig } from '@orchentra/cli-api'
import { getActiveRepo as defaultGetActiveRepo } from '../../session-config'
import type { CommandContext, CommandHandler, SlashCommandSpec } from '../registry'
import type { RepoPickerItem, UiOutput } from '../ui-output'

interface RepoRow {
  readonly fullName: string
  readonly installed: boolean
  readonly monitored: boolean
}

interface ReposResponse {
  readonly repos: readonly RepoRow[]
}

export interface ReposSlashDeps {
  /**
   * Resolve the Orchentra config bundle (server URL + orgId + apiKey).
   * Defaults to {@link resolveOrchentraConfig}; tests inject a stub.
   */
  readonly loadConfig?: (cwd: string) => OrchentraConfig
  /**
   * Fetch implementation. Injected so tests can return canned responses
   * without standing up a real HTTP server.
   */
  readonly fetch?: typeof fetch
  /** Read the persisted active repo. Defaults to the session-config module. */
  readonly getActiveRepo?: () => string | null
}

/**
 * `/repos` — org-wide interactive repo picker. Renders every repo the
 * signed-in installation can see, tagged with whether the Orchentra GH App
 * is installed on the owner and whether the org has subscribed (monitored)
 * to the repo. Selection persists to `~/.config/orchentra/session.json` so
 * subsequent repo-scoped verbs default to the chosen repo.
 */
export class ReposSlashCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'repos',
    aliases: ['repo'],
    summary: 'Pick an active repo (installed App + monitored markers)',
  }

  private readonly loadConfig: (cwd: string) => OrchentraConfig
  private readonly fetchFn: typeof fetch
  private readonly getActive: () => string | null

  constructor(deps: ReposSlashDeps = {}) {
    this.loadConfig = deps.loadConfig ?? ((cwd) => resolveOrchentraConfig({ cwd }))
    this.fetchFn = deps.fetch ?? fetch
    this.getActive = deps.getActiveRepo ?? defaultGetActiveRepo
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    const emit: (o: UiOutput) => void = ctx.ui ?? (() => {})

    let config: OrchentraConfig
    try {
      config = this.loadConfig(ctx.cwd)
    } catch (err) {
      emit({
        kind: 'note',
        tone: 'warn',
        text:
          err instanceof Error
            ? `${err.message}\n\nRun \`orchentra init\` to install the GitHub App and mint an API key.`
            : 'Failed to resolve Orchentra config. Run `orchentra init` to onboard.',
      })
      return true
    }

    const url = `${config.serverUrl}/api/orgs/${encodeURIComponent(config.orgId)}/repos/available`
    let res: Response
    try {
      res = await this.fetchFn(url, { headers: { Authorization: `Bearer ${config.apiKey}` } })
    } catch (err) {
      emit({
        kind: 'note',
        tone: 'warn',
        text: `Could not reach the Orchentra server at ${config.serverUrl}: ${err instanceof Error ? err.message : String(err)}`,
      })
      return true
    }

    if (!res.ok) {
      emit({
        kind: 'note',
        tone: 'warn',
        text: `GET /repos/available failed: ${res.status} ${res.statusText}`,
      })
      return true
    }

    const body = (await res.json()) as ReposResponse
    const repos: RepoPickerItem[] = [...body.repos]
      .sort((a, b) => {
        if (a.installed !== b.installed) return a.installed ? -1 : 1
        return a.fullName.localeCompare(b.fullName)
      })
      .map((r) => ({ fullName: r.fullName, installed: r.installed, monitored: r.monitored }))

    if (repos.length === 0) {
      emit({
        kind: 'note',
        tone: 'info',
        text: 'No repos available. Install the Orchentra GitHub App on a repo to see it here.',
      })
      return true
    }

    emit({ kind: 'repo-picker', repos, current: this.getActive() })
    return true
  }
}
