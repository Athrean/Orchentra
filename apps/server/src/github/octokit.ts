import { Octokit } from '@octokit/rest'
import { throttling } from '@octokit/plugin-throttling'
import { retry } from '@octokit/plugin-retry'
import { config } from '../config'
import { buildAppOctokit, loadAppCredentialsFromEnv } from './octokit-app'
import { buildThrottleOptions } from './octokit-plugins'

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
