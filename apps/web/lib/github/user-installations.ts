import { Octokit } from '@octokit/rest'

/**
 * Installations of THIS GitHub App that the authenticated user can access —
 * their personal account plus any org they admin. Resolved from the user's
 * OAuth token (Supabase `session.provider_token`), which is the only way to
 * know org membership. Used to detect an already-installed app during
 * onboarding so the user isn't asked to re-install.
 */
export interface AccessibleInstallation {
  id: number
  accountLogin: string
  accountType: 'User' | 'Organization'
  repositorySelection: 'all' | 'selected'
  permissions: Record<string, string>
  events: string[]
}

export async function listAccessibleInstallations(userToken: string): Promise<AccessibleInstallation[]> {
  const octokit = new Octokit({ auth: userToken })

  const out: AccessibleInstallation[] = []
  for (let page = 1; page <= 20; page += 1) {
    const res = await octokit.request('GET /user/installations', { per_page: 100, page })
    const data = res.data as {
      installations: Array<{
        id: number
        account: { login: string; type: string } | null
        repository_selection: 'all' | 'selected'
        permissions: Record<string, string>
        events: string[]
      }>
    }
    for (const inst of data.installations) {
      if (!inst.account) continue
      out.push({
        id: inst.id,
        accountLogin: inst.account.login,
        accountType: inst.account.type === 'Organization' ? 'Organization' : 'User',
        repositorySelection: inst.repository_selection,
        permissions: inst.permissions ?? {},
        events: inst.events ?? [],
      })
    }
    if (data.installations.length < 100) break
  }
  return out
}
