import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getCredential } from '../credential-store'

export interface OrchentraConfig {
  readonly serverUrl: string
  readonly orgId: string
  readonly apiKey: string
}

export interface ResolveConfigOptions {
  readonly cwd: string
  readonly home?: string
  readonly env?: NodeJS.ProcessEnv
}

const DEFAULT_SERVER_URL = 'http://localhost:3001'
const SETTINGS_PATH = ['.orchentra', 'settings.json']

interface ProjectSettings {
  serverUrl?: string
  orgId?: string
}

export class MissingOrchentraConfigError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(
      `Missing Orchentra config: ${missing.join(', ')}. ` +
        `Set ORCHENTRA_ORG_ID / ORCHENTRA_API_KEY (and optionally ORCHENTRA_SERVER_URL), ` +
        `or run \`orchentra login orchentra --api-key\` and add an \`orgId\` to .orchentra/settings.json.`,
    )
    this.name = 'MissingOrchentraConfigError'
  }
}

function readProjectSettings(cwd: string): ProjectSettings {
  const path = join(cwd, ...SETTINGS_PATH)
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as ProjectSettings
    return {
      serverUrl: typeof parsed.serverUrl === 'string' ? parsed.serverUrl : undefined,
      orgId: typeof parsed.orgId === 'string' ? parsed.orgId : undefined,
    }
  } catch {
    return {}
  }
}

export function resolveOrchentraConfig(opts: ResolveConfigOptions): OrchentraConfig {
  const env = opts.env ?? process.env
  const home = opts.home ?? homedir()
  const file = readProjectSettings(opts.cwd)
  const stored = getCredential('orchentra', home)

  const serverUrl = env.ORCHENTRA_SERVER_URL?.trim() || file.serverUrl?.trim() || DEFAULT_SERVER_URL
  const orgId = env.ORCHENTRA_ORG_ID?.trim() || file.orgId?.trim() || ''
  const apiKey = env.ORCHENTRA_API_KEY?.trim() || stored?.apiKey?.trim() || ''

  const missing: string[] = []
  if (orgId.length === 0) missing.push('orgId')
  if (apiKey.length === 0) missing.push('apiKey')
  if (missing.length > 0) throw new MissingOrchentraConfigError(missing)

  return { serverUrl, orgId, apiKey }
}
