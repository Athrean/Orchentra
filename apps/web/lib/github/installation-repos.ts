import { Octokit } from '@octokit/rest'
import { mintInstallationToken } from './app-jwt'

export interface InstallationRepo {
  id: number
  name: string
  fullName: string
  private: boolean
  defaultBranch: string
  htmlUrl: string
}

/**
 * List all repos accessible to a given installation. Handles pagination.
 * Tokens are short-lived (1h) — call per-request, do not cache.
 */
export async function listInstallationRepos(installationId: number): Promise<InstallationRepo[]> {
  const token = await mintInstallationToken(installationId)
  const octokit = new Octokit({ auth: token })

  const repos: InstallationRepo[] = []
  for (let page = 1; page <= 20; page += 1) {
    const res = await octokit.request('GET /installation/repositories', { per_page: 100, page })
    const data = res.data as {
      repositories: Array<{
        id: number
        name: string
        full_name: string
        private: boolean
        default_branch: string
        html_url: string
      }>
    }
    for (const r of data.repositories) {
      repos.push({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
        htmlUrl: r.html_url,
      })
    }
    if (data.repositories.length < 100) break
  }
  return repos
}
