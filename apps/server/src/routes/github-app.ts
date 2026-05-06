import { Hono } from 'hono'
import { Octokit } from '@octokit/rest'
import { loadAppCredentialsFromEnv } from '../github/octokit-app'
import { mintAppJwt } from '../github/app-jwt'
import { recordInstallation } from '../github/installations'
import { resolveOrgIdForInstallation } from '../github/installation-handlers'

export const githubAppRouter = new Hono()

const FRONTEND_URL = (): string => process.env.FRONTEND_URL ?? 'http://localhost:3000'

function redirectWithError(message: string): Response {
  const url = new URL('/dashboard/integrations', FRONTEND_URL())
  url.searchParams.set('error', message)
  return Response.redirect(url.toString(), 302)
}

function redirectWithSuccess(installationId: number, setupAction: string): Response {
  const url = new URL('/dashboard/integrations', FRONTEND_URL())
  url.searchParams.set('installed', String(installationId))
  url.searchParams.set('setup_action', setupAction)
  return Response.redirect(url.toString(), 302)
}

interface InstallationApiResponse {
  id: number
  account: { login: string; id: number; type: 'User' | 'Organization' } | null
  repository_selection: 'all' | 'selected'
  permissions: Record<string, string>
  events: string[]
}

/**
 * GitHub App "Setup URL" callback. GitHub redirects the installer here after
 * an install / update with `installation_id` + `setup_action` query params.
 *
 * Slice 3 lands the dev-loop happy path:
 *   1. Mint a JWT with the App private key.
 *   2. Call GET /app/installations/:id with the JWT (App-level auth).
 *   3. Persist via recordInstallation (slice 2 helper / slice 3 stub).
 *   4. Redirect to the dashboard.
 *
 * The `state` param is reserved for the slice-6 CSRF / org-binding flow. For
 * now we trust the App's installer == the org owner and fall back to
 * resolveOrgIdForInstallation.
 */
githubAppRouter.get('/callback', async (c) => {
  const installationIdStr = c.req.query('installation_id')
  const setupAction = c.req.query('setup_action') ?? 'install'

  if (!installationIdStr) {
    return redirectWithError('missing_installation_id')
  }
  const installationId = Number(installationIdStr)
  if (!Number.isInteger(installationId) || installationId <= 0) {
    return redirectWithError('invalid_installation_id')
  }

  const creds = loadAppCredentialsFromEnv()
  if (!creds) {
    return redirectWithError('app_credentials_unavailable')
  }

  let metadata: InstallationApiResponse
  try {
    const jwt = await mintAppJwt(creds)
    const octokit = new Octokit({ auth: jwt })
    const res = await octokit.request('GET /app/installations/{installation_id}', { installation_id: installationId })
    metadata = res.data as unknown as InstallationApiResponse
  } catch (err) {
    console.error('github-app callback: install metadata fetch failed', err)
    return redirectWithError('metadata_fetch_failed')
  }

  if (!metadata.account) {
    return redirectWithError('installation_account_missing')
  }

  try {
    await recordInstallation({
      installationId: metadata.id,
      orgId: resolveOrgIdForInstallation(metadata.id),
      account: metadata.account,
      repositorySelection: metadata.repository_selection,
      permissions: metadata.permissions ?? {},
      events: metadata.events ?? [],
      suspendedAt: null,
    })
  } catch (err) {
    console.error('github-app callback: recordInstallation failed', err)
    return redirectWithError('persist_failed')
  }

  return redirectWithSuccess(installationId, setupAction)
})
