import { Hono } from 'hono'
import { Octokit } from '@octokit/rest'
import { loadAppCredentialsFromEnv, type AppCredentials } from '../github/octokit-app'
import { mintAppJwt } from '../github/app-jwt'
import { recordInstallation, type RecordInstallationInput } from '../github/installations'
import { resolveOrgIdForInstallation } from '../github/installation-handlers'
import {
  HandoffExpiredError,
  HandoffNotFoundError,
  type InstallHandoffStore,
} from '../github/install-handoff-memory-store'
import { mintApiKey, type MintedApiKey } from '../github/api-key-issuer'

/**
 * Dependencies wired into the install-callback route. Exposed so tests can
 * stub the GH HTTP call and the persistence layer without resorting to
 * mock.module — keeps the install-token test (github-app-auth.test.ts) and
 * the callback test free of cross-file mock leakage.
 */
export interface GithubAppCallbackDeps {
  loadAppCredentials(): AppCredentials | null
  mintJwt(creds: AppCredentials): Promise<string>
  fetchInstallationMetadata(jwt: string, installationId: number): Promise<InstallationApiResponse>
  recordInstallation(input: RecordInstallationInput): Promise<unknown>
  resolveOrgId(installationId: number): string
  frontendUrl(): string
  handoffStore?: InstallHandoffStore
  mintApiKey?(): MintedApiKey
  now?(): Date
}

export interface InstallationApiResponse {
  id: number
  account: { login: string; id: number; type: 'User' | 'Organization' } | null
  repository_selection: 'all' | 'selected'
  permissions: Record<string, string>
  events: string[]
}

const defaultDeps: GithubAppCallbackDeps = {
  loadAppCredentials: () => loadAppCredentialsFromEnv(),
  mintJwt: (creds) => mintAppJwt(creds),
  fetchInstallationMetadata: async (jwt, installationId) => {
    const octokit = new Octokit({ auth: jwt })
    const res = await octokit.request('GET /app/installations/{installation_id}', {
      installation_id: installationId,
    })
    return res.data as unknown as InstallationApiResponse
  },
  recordInstallation: (input) => recordInstallation(input),
  resolveOrgId: (id) => resolveOrgIdForInstallation(id),
  frontendUrl: () => process.env.FRONTEND_URL ?? 'http://localhost:3000',
  mintApiKey: () => mintApiKey(),
  now: () => new Date(),
}

function redirectWithError(deps: GithubAppCallbackDeps, message: string): Response {
  const url = new URL('/dashboard/integrations', deps.frontendUrl())
  url.searchParams.set('error', message)
  return Response.redirect(url.toString(), 302)
}

function redirectWithSuccess(deps: GithubAppCallbackDeps, installationId: number, setupAction: string): Response {
  const url = new URL('/dashboard/integrations', deps.frontendUrl())
  url.searchParams.set('installed', String(installationId))
  url.searchParams.set('setup_action', setupAction)
  return Response.redirect(url.toString(), 302)
}

function redirectToLoopback(redirectUri: string, params: Record<string, string>): Response {
  const url = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return Response.redirect(url.toString(), 302)
}

function resolveHandoffRedirect(deps: GithubAppCallbackDeps, state: string): string | null {
  if (!deps.handoffStore) return null
  const entry = deps.handoffStore.get(state)
  if (!entry || entry.status !== 'pending') return null
  return entry.redirectUri
}

function errorRedirect(deps: GithubAppCallbackDeps, handoffRedirect: string | null, code: string): Response {
  if (handoffRedirect) return redirectToLoopback(handoffRedirect, { error: code })
  return redirectWithError(deps, code)
}

/**
 * Build the GH App install-callback router. Production path uses the default
 * deps (real GH HTTP + real installations queries). Tests pass an override.
 *
 * GitHub App "Setup URL" callback: GH redirects the installer here after an
 * install / update with `installation_id` + `setup_action`. We mint a JWT,
 * fetch install metadata, persist via recordInstallation, then redirect to
 * the dashboard with a success or error flag. The `state` param is reserved
 * for the slice-6 CSRF / org-binding flow.
 */
export function createGithubAppRouter(overrides: Partial<GithubAppCallbackDeps> = {}): Hono {
  const deps: GithubAppCallbackDeps = { ...defaultDeps, ...overrides }
  const router = new Hono()

  router.get('/callback', async (c) => {
    const installationIdStr = c.req.query('installation_id')
    const setupAction = c.req.query('setup_action') ?? 'install'
    const state = c.req.query('state')

    // Resolve the handoff entry up-front so failure paths on a state-bearing
    // callback redirect to the CLI loopback (not the dashboard).
    const handoffRedirect = state ? resolveHandoffRedirect(deps, state) : null

    if (!installationIdStr) return errorRedirect(deps, handoffRedirect, 'missing_installation_id')
    const installationId = Number(installationIdStr)
    if (!Number.isInteger(installationId) || installationId <= 0) {
      return errorRedirect(deps, handoffRedirect, 'invalid_installation_id')
    }
    if (state && !handoffRedirect) {
      return redirectWithError(deps, 'invalid_state')
    }

    const creds = deps.loadAppCredentials()
    if (!creds) return errorRedirect(deps, handoffRedirect, 'app_credentials_unavailable')

    let metadata: InstallationApiResponse
    try {
      const jwt = await deps.mintJwt(creds)
      metadata = await deps.fetchInstallationMetadata(jwt, installationId)
    } catch (err) {
      console.error('github-app callback: install metadata fetch failed', err)
      return errorRedirect(deps, handoffRedirect, 'metadata_fetch_failed')
    }

    if (!metadata.account) return errorRedirect(deps, handoffRedirect, 'installation_account_missing')

    const orgId = deps.resolveOrgId(metadata.id)
    const minted = handoffRedirect && deps.mintApiKey ? deps.mintApiKey() : null
    const issuedAt = minted && deps.now ? deps.now() : null

    try {
      await deps.recordInstallation({
        installationId: metadata.id,
        orgId,
        account: metadata.account,
        repositorySelection: metadata.repository_selection,
        permissions: metadata.permissions ?? {},
        events: metadata.events ?? [],
        suspendedAt: null,
        ...(minted ? { apiKeyHash: minted.hash, apiKeyIssuedAt: issuedAt } : {}),
      })
    } catch (err) {
      console.error('github-app callback: recordInstallation failed', err)
      return errorRedirect(deps, handoffRedirect, 'persist_failed')
    }

    if (handoffRedirect && minted && state && deps.handoffStore) {
      try {
        deps.handoffStore.complete(state, {
          orgId,
          installationId: metadata.id,
          apiKey: minted.plaintext,
        })
      } catch (err) {
        if (err instanceof HandoffExpiredError) {
          return errorRedirect(deps, handoffRedirect, 'state_expired')
        }
        if (err instanceof HandoffNotFoundError) {
          return errorRedirect(deps, handoffRedirect, 'invalid_state')
        }
        throw err
      }
      return redirectToLoopback(handoffRedirect, {
        orgId,
        installationId: String(metadata.id),
        apiKey: minted.plaintext,
      })
    }

    return redirectWithSuccess(deps, installationId, setupAction)
  })

  return router
}
