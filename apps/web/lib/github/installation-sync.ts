import { upsertUserInstallation } from '../db/queries/installations'
import { getOnboardingState, setOnboardingStep } from '../db/queries/onboarding'
import { listAccessibleInstallations } from './user-installations'

/**
 * Reconcile a user's stored GitHub App installations against what GitHub says
 * they can access right now, using their OAuth token. Upserts each install and,
 * if any exist, advances onboarding past the install step. Shared by the OAuth
 * callback (token guaranteed fresh) and the onboarding sync endpoint.
 *
 * Returns the number of installations found. Throws on GitHub/DB errors — the
 * caller decides whether to surface or swallow.
 */
export async function syncUserInstallations(userId: string, providerToken: string): Promise<number> {
  const found = await listAccessibleInstallations(providerToken)
  for (const inst of found) {
    await upsertUserInstallation(userId, {
      installationId: inst.id,
      accountLogin: inst.accountLogin,
      accountType: inst.accountType,
      repositorySelection: inst.repositorySelection,
      permissions: inst.permissions,
      events: inst.events,
    })
  }
  if (found.length > 0) {
    const ob = await getOnboardingState(userId).catch(() => null)
    if (ob && (ob.step === 'welcome' || ob.step === 'install_app')) {
      await setOnboardingStep(userId, 'select_repos').catch(() => {})
    }
  }
  return found.length
}
