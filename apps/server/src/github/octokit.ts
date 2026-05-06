import { Octokit } from '@octokit/rest'
import { throttling } from '@octokit/plugin-throttling'
import { retry } from '@octokit/plugin-retry'
import { config } from '../config'
import { buildAppOctokit, loadAppCredentialsFromEnv } from './octokit-app'
import { buildThrottleOptions } from './octokit-plugins'
import { getInstallationByOrg, getDefaultInstallation } from './installations'
import { getCredential } from '../vault'
import type { VaultActor } from '../vault'

const HardenedOctokit = Octokit.plugin(throttling, retry)

export type OctokitLike = Pick<
  Octokit,
  'actions' | 'issues' | 'pulls' | 'repos' | 'search' | 'paginate' | 'request' | 'git' | 'checks'
>

export type OctokitBuilder = (opts: { auth?: string; log?: unknown }) => OctokitLike

let instance: OctokitLike | null = null
let builderOverride: OctokitBuilder | null = null

function defaultBuilder(opts: { auth?: string; log?: unknown }): OctokitLike {
  // Prefer GitHub App install-token auth when configured + a per-call auth override
  // was not supplied (per-call auth = user-scoped path, kept on PAT semantics).
  if (!opts.auth) {
    const appCreds = loadAppCredentialsFromEnv()
    if (appCreds && appCreds.installationId) {
      return buildAppOctokit(appCreds)
    }
  }
  return new HardenedOctokit({
    auth: opts.auth ?? config.github.token,
    baseUrl: config.github.api_base_url ?? 'https://api.github.com',
    throttle: buildThrottleOptions('pat'),
    ...(opts.log ? { log: opts.log as never } : {}),
  })
}

/** Build an Octokit instance with a specific auth token (used by per-user / fallback paths). */
export function buildOctokit(opts: { auth?: string; log?: unknown } = {}): OctokitLike {
  return (builderOverride ?? defaultBuilder)(opts)
}

/** Get (or lazily build) the shared Octokit instance bound to the configured app token. */
export function getOctokit(): OctokitLike {
  if (!instance) instance = buildOctokit()
  return instance
}

/** Test-only seam — swap the shared Octokit instance used by all callers of getOctokit(). */
export function setOctokitForTesting(client: OctokitLike): void {
  instance = client
}

/** Test-only seam — swap the per-call builder used by buildOctokit(). */
export function setOctokitBuilderForTesting(builder: OctokitBuilder | null): void {
  builderOverride = builder
}

/** Test-only seam — drop the cached instance so the next getOctokit() rebuilds. */
export function resetOctokitForTesting(): void {
  instance = null
}

const SYSTEM_ACTOR: VaultActor = { type: 'system', id: 'getOctokitForInstall' }

/**
 * Build an install-scoped Octokit for `orgId`. Resolution order:
 *
 *   1. test override (per-org cache override or builderOverride)
 *   2. vault — `github.app.private_key` for the org + install id from
 *      github_installations
 *   3. env — GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY_PATH +
 *      GITHUB_APP_INSTALLATION_ID (single-tenant dev fallback)
 *   4. PAT — process-default Octokit
 *
 * The returned client is *not* cached process-wide because each org should
 * mint its own install token. Callers that need a per-org cache should layer
 * one above this function.
 */
export async function getOctokitForInstall(orgId: string): Promise<OctokitLike> {
  if (perOrgOverride.has(orgId)) {
    return perOrgOverride.get(orgId) as OctokitLike
  }

  // 2. Vault path — preferred when the org has uploaded its own GH App key.
  const vaultCred = await getCredential(orgId, 'github.app.private_key', SYSTEM_ACTOR)
  if (vaultCred) {
    const install = await getInstallationByOrg(orgId)
    const appIdRaw = vaultCred.metadata.appId
    const appId = typeof appIdRaw === 'number' ? appIdRaw : Number(appIdRaw)
    const installationId = install?.installationId ?? (await getDefaultInstallation())?.installationId
    if (Number.isFinite(appId) && installationId) {
      return buildAppOctokit({ appId, privateKey: vaultCred.value, installationId })
    }
  }

  // 3. Env path — same shape as the existing single-tenant App auth.
  const envCreds = loadAppCredentialsFromEnv()
  if (envCreds) {
    const install = await getInstallationByOrg(orgId)
    const installationId = install?.installationId ?? envCreds.installationId
    if (installationId) {
      return buildAppOctokit(envCreds, installationId)
    }
  }

  // 4. PAT fallback — uses the process-default singleton.
  return getOctokit()
}

const perOrgOverride = new Map<string, OctokitLike>()

/** Test-only seam — pre-seed an Octokit for a specific orgId. */
export function setOctokitForOrgForTesting(orgId: string, client: OctokitLike | null): void {
  if (client === null) perOrgOverride.delete(orgId)
  else perOrgOverride.set(orgId, client)
}
