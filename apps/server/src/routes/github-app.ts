import { Hono } from 'hono'
import { Octokit } from '@octokit/rest'
import { loadAppCredentialsFromEnv, type AppCredentials } from '../github/octokit-app'
import { mintAppJwt } from '../github/app-jwt'
import { recordInstallation, type RecordInstallationInput } from '../github/installations'
import { resolveOrgIdForInstallation } from '../github/installation-handlers'

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

    if (!installationIdStr) return redirectWithError(deps, 'missing_installation_id')
    const installationId = Number(installationIdStr)
    if (!Number.isInteger(installationId) || installationId <= 0) {
      return redirectWithError(deps, 'invalid_installation_id')
    }

    const creds = deps.loadAppCredentials()
    if (!creds) return redirectWithError(deps, 'app_credentials_unavailable')

    let metadata: InstallationApiResponse
    try {
      const jwt = await deps.mintJwt(creds)
      metadata = await deps.fetchInstallationMetadata(jwt, installationId)
    } catch (err) {
      console.error('github-app callback: install metadata fetch failed', err)
      return redirectWithError(deps, 'metadata_fetch_failed')
    }

    if (!metadata.account) return redirectWithError(deps, 'installation_account_missing')

    try {
      await deps.recordInstallation({
        installationId: metadata.id,
        orgId: deps.resolveOrgId(metadata.id),
        account: metadata.account,
        repositorySelection: metadata.repository_selection,
        permissions: metadata.permissions ?? {},
        events: metadata.events ?? [],
        suspendedAt: null,
      })
    } catch (err) {
      console.error('github-app callback: recordInstallation failed', err)
      return redirectWithError(deps, 'persist_failed')
    }

    return redirectWithSuccess(deps, installationId, setupAction)
  })

  return router
}

export const githubAppRouter = createGithubAppRouter()
