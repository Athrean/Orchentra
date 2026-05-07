import {
  dispatch,
  listRepoSecretsOperation,
  setRepoSecretOperation,
  type OperationContext,
  type OperationScope,
} from '@orchentra/operations'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set<OperationScope>(['read', 'write', 'admin']),
}

export interface EnvListResult {
  secrets: Array<{ name: string; updatedAt: string }>
}

export async function envList(owner: string, repo: string): Promise<EnvListResult | { error: string }> {
  const res = (await dispatch(listRepoSecretsOperation, localCtx, { owner, repo })) as
    | { totalCount: number; secrets: Array<{ name: string; updatedAt: string }> }
    | { error: string }
  if ('error' in res) return res
  return { secrets: res.secrets.map((s) => ({ name: s.name, updatedAt: s.updatedAt })) }
}

export async function envSet(
  owner: string,
  repo: string,
  secretName: string,
  value: string,
): Promise<{ ok: true; secretName: string } | { error: string }> {
  const res = (await dispatch(setRepoSecretOperation, localCtx, { owner, repo, secretName, value })) as
    | { ok: true; secretName: string }
    | { error: string }
  return res
}

export interface EnvSyncOptions {
  owner: string
  repo: string
  envFileText: string
  approve: (toSync: string[]) => Promise<boolean>
}

export interface EnvSyncResult {
  synced: string[]
  skipped: string[]
}

/**
 * Parse an `.env`-style file and PUT each KEY=VALUE pair into GitHub Actions
 * secrets via set_repo_secret. Single batched approval per the design rule
 * (no per-secret prompt).
 */
export async function envSync(opts: EnvSyncOptions): Promise<EnvSyncResult> {
  const entries = parseEnvFile(opts.envFileText)
  const names = entries.map(([k]) => k)

  if (names.length === 0) {
    return { synced: [], skipped: ['no keys parsed from .env'] }
  }

  const approved = await opts.approve(names)
  if (!approved) return { synced: [], skipped: ['approval denied'] }

  const synced: string[] = []
  const skipped: string[] = []
  for (const [name, value] of entries) {
    const res = await envSet(opts.owner, opts.repo, name, value)
    if ('error' in res) skipped.push(`${name}: ${res.error}`)
    else synced.push(name)
  }
  return { synced, skipped }
}

/**
 * Minimal `.env` parser. Supports KEY=value, KEY="quoted value",
 * # comments, blank lines, and quote stripping. Values are read verbatim
 * (no shell expansion) so the actual content reaches GitHub unchanged.
 */
export function parseEnvFile(text: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out.push([key, value])
  }
  return out
}
