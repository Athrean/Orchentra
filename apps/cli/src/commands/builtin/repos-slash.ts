import { resolveOrchentraConfig, type OrchentraConfig } from '@orchentra/cli-api'
import type { CommandContext, CommandHandler, SlashCommandSpec } from '../registry'
import type { UiCardSection, UiKVRow, UiOutput } from '../ui-output'

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
}

/**
 * `/repos` — org-wide tabular view of repos visible to the signed-in
 * Orchentra installation. Two tabs (`Installed`, `All`) so the user can
 * see at a glance which repos the GitHub App backs and which are merely
 * accessible.
 *
 * The actual data merge (installed + monitored flags) happens server-side
 * in {@link markRepoInstallation}; this command is the read-only viewer.
 */
export class ReposSlashCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'repos',
    aliases: [],
    summary: 'Org-wide repo view — installed App + monitored repos',
  }

  private readonly loadConfig: (cwd: string) => OrchentraConfig
  private readonly fetchFn: typeof fetch

  constructor(deps: ReposSlashDeps = {}) {
    this.loadConfig = deps.loadConfig ?? ((cwd) => resolveOrchentraConfig({ cwd }))
    this.fetchFn = deps.fetch ?? fetch
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
    const allRepos = [...body.repos].sort((a, b) => a.fullName.localeCompare(b.fullName))
    const installedRepos = allRepos.filter((r) => r.installed)

    const sectionsByTab: readonly UiCardSection[][] = [sectionsFor(installedRepos), sectionsFor(allRepos)]

    emit({
      kind: 'card',
      title: 'Repos',
      subtitle: `${installedRepos.length} installed · ${allRepos.length} accessible`,
      tabs: { items: ['Installed', 'All'], active: 0 },
      sections: sectionsByTab[0]!,
      sectionsByTab,
    })

    return true
  }
}

function sectionsFor(repos: readonly RepoRow[]): UiCardSection[] {
  if (repos.length === 0) {
    return [{ rows: [{ key: '—', value: 'no repos to show' }] }]
  }
  const rows: UiKVRow[] = repos.map((r) => ({ key: r.fullName, value: tagsFor(r) }))
  return [{ rows }]
}

function tagsFor(row: RepoRow): string {
  const parts: string[] = []
  if (row.installed) parts.push('✓ installed')
  else parts.push('— not installed')
  if (row.monitored) parts.push('✓ monitored')
  return parts.join(' · ')
}
