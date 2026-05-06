import { createAppAuth } from '@octokit/auth-app'
import type { AppCredentials } from './octokit-app'

/**
 * Mint a short-lived (~10m) JWT signed with the App private key. Used by the
 * install callback (Slice 3) and Slice 2's vault path to bootstrap installation
 * lookups before any installation token exists. Returns the raw JWT string —
 * callers attach `Authorization: Bearer <jwt>` themselves.
 */
export async function mintAppJwt(creds: AppCredentials): Promise<string> {
  const auth = createAppAuth({ appId: creds.appId, privateKey: creds.privateKey })
  const result = await auth({ type: 'app' })
  return result.token
}
