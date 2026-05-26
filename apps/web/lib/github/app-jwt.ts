import { createAppAuth } from '@octokit/auth-app'
import { loadAppCredentials } from './app-credentials'

/**
 * Mint a short-lived (~10m) JWT signed with the App private key. Used to
 * bootstrap App-level GH API calls (e.g. fetch installation metadata) before
 * any installation token exists. Callers attach `Authorization: Bearer <jwt>`.
 */
export async function mintAppJwt(): Promise<string> {
  const { appId, privateKey } = loadAppCredentials()
  const auth = createAppAuth({ appId, privateKey })
  const result = await auth({ type: 'app' })
  return result.token
}

/**
 * Mint a short-lived installation token (1h) for the given installation id.
 * Use this to call GH APIs scoped to a single install (list repos, read
 * actions, etc).
 */
export async function mintInstallationToken(installationId: number): Promise<string> {
  const { appId, privateKey } = loadAppCredentials()
  const auth = createAppAuth({ appId, privateKey })
  const result = await auth({ type: 'installation', installationId })
  return result.token
}
