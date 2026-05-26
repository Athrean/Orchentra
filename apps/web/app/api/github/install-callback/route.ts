import { Octokit } from '@octokit/rest'
import { NextResponse, type NextRequest } from 'next/server'
import { getOrCreateOnboardingState, setOnboardingStep } from '../../../../lib/db/queries/onboarding'
import { upsertUserInstallation } from '../../../../lib/db/queries/installations'
import { mintAppJwt } from '../../../../lib/github/app-jwt'
import { verifyInstallState } from '../../../../lib/github/install-state'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface InstallationApiResponse {
  id: number
  account: { login: string; id: number; type: 'User' | 'Organization' } | null
  repository_selection: 'all' | 'selected'
  permissions: Record<string, string>
  events: string[]
}

function redirectToOnboarding(req: NextRequest, qs: Record<string, string>): NextResponse {
  const url = req.nextUrl.clone()
  url.pathname = '/onboarding'
  url.search = ''
  for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const installationIdRaw = searchParams.get('installation_id')
  const setupAction = searchParams.get('setup_action') ?? ''
  const state = searchParams.get('state')

  if (!installationIdRaw || !state) {
    return redirectToOnboarding(req, { error: 'missing_install_params' })
  }

  const installationId = Number(installationIdRaw)
  if (!Number.isFinite(installationId)) {
    return redirectToOnboarding(req, { error: 'bad_installation_id' })
  }

  const verified = verifyInstallState(state)
  if (!verified) {
    return redirectToOnboarding(req, { error: 'bad_state' })
  }
  const { userId } = verified

  if (setupAction === 'request') {
    return redirectToOnboarding(req, { info: 'install_requested' })
  }

  let metadata: InstallationApiResponse
  try {
    const jwt = await mintAppJwt()
    const octokit = new Octokit({ auth: jwt })
    const res = await octokit.request('GET /app/installations/{installation_id}', { installation_id: installationId })
    metadata = res.data as unknown as InstallationApiResponse
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch_install_failed'
    return redirectToOnboarding(req, { error: msg })
  }

  if (!metadata.account) {
    return redirectToOnboarding(req, { error: 'install_no_account' })
  }

  await upsertUserInstallation(userId, {
    installationId,
    accountLogin: metadata.account.login,
    accountType: metadata.account.type,
    repositorySelection: metadata.repository_selection,
    permissions: metadata.permissions,
    events: metadata.events,
  })

  try {
    // Ensure the row exists (user may have installed via a direct URL without
    // first visiting /onboarding) before advancing the step.
    await getOrCreateOnboardingState(userId)
    await setOnboardingStep(userId, 'select_repos')
  } catch (err) {
    console.warn('[install-callback] failed to advance onboarding step', err)
  }

  return redirectToOnboarding(req, { installed: String(installationId) })
}
