import { MissingOrchentraConfigError, resolveOrchentraConfig, type OrchentraConfig } from '@orchentra/cli-api'
import type { CommandContext } from '../registry'
import type { UiKVRow } from '../ui-output'
import type { PrereqCheck, PrereqCheckResult } from './incident-prereq'

/**
 * Environment seam — kept narrow so tests can swap the side-effectful
 * pieces (config resolution, git remote lookup) without monkey-patching.
 */
export interface IncidentPrereqEnv {
  resolveConfig(cwd: string): OrchentraConfig
  readRepoOrigin(cwd: string): string | null
}

const APP_SLUG = 'orchentra'

function parseGitHubOwner(originUrl: string): string | null {
  const sshMatch = originUrl.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshMatch) return sshMatch[1]
  const httpsMatch = originUrl.match(/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return httpsMatch[1]
  return null
}

function buildInstallRow(originUrl: string | null): UiKVRow {
  if (!originUrl) {
    return { key: 'GitHub App', value: 'n/a — no git origin detected' }
  }
  const owner = parseGitHubOwner(originUrl)
  if (!owner) {
    return { key: 'GitHub App', value: 'not a github repo' }
  }
  return {
    key: 'GitHub App',
    value: `install at https://github.com/apps/${APP_SLUG}/installations/new`,
  }
}

export function buildIncidentPrereq(env: IncidentPrereqEnv): PrereqCheck {
  return {
    async check(ctx: CommandContext): Promise<PrereqCheckResult> {
      try {
        env.resolveConfig(ctx.cwd)
        return { ok: true }
      } catch (err) {
        if (!(err instanceof MissingOrchentraConfigError)) throw err
        const missing = err.missing.join(', ')
        const rows: UiKVRow[] = [
          {
            key: 'Orchentra config',
            value: `missing: ${missing}. set ORCHENTRA_ORG_ID + ORCHENTRA_API_KEY (or apiKey via \`orchentra login\` + orgId in .orchentra/settings.json)`,
          },
          buildInstallRow(env.readRepoOrigin(ctx.cwd)),
        ]
        return { ok: false, rows }
      }
    },
  }
}

function defaultReadOrigin(cwd: string): string | null {
  const res = Bun.spawnSync(['git', 'remote', 'get-url', 'origin'], { cwd, stdout: 'pipe', stderr: 'pipe' })
  if (res.exitCode !== 0) return null
  const out = new TextDecoder().decode(res.stdout).trim()
  return out.length === 0 ? null : out
}

/** Production wiring: real config resolver + real git remote probe. */
export const defaultIncidentPrereq: PrereqCheck = buildIncidentPrereq({
  resolveConfig: (cwd) => resolveOrchentraConfig({ cwd }),
  readRepoOrigin: (cwd) => defaultReadOrigin(cwd),
})
