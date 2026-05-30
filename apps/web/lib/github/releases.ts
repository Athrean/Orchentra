import { Octokit } from '@octokit/rest'
import { mintInstallationToken } from './app-jwt'

export interface ReleaseSummary {
  repo: string
  name: string
  tag: string
  url: string
  publishedAt: string | null
  draft: boolean
  prerelease: boolean
}

interface OctokitRelease {
  name: string | null
  tag_name: string
  html_url: string
  published_at: string | null
  created_at: string
  draft: boolean
  prerelease: boolean
}

export function mapRelease(repoFullName: string, release: OctokitRelease): ReleaseSummary {
  return {
    repo: repoFullName,
    name: release.name || release.tag_name,
    tag: release.tag_name,
    url: release.html_url,
    publishedAt: release.published_at ?? release.created_at ?? null,
    draft: release.draft,
    prerelease: release.prerelease,
  }
}

async function getRepoReleases(
  installationId: number,
  repoFullName: string,
  perRepo: number,
): Promise<ReleaseSummary[]> {
  const [owner, repo] = repoFullName.split('/')
  if (!owner || !repo) return []
  try {
    const token = await mintInstallationToken(installationId)
    const octokit = new Octokit({ auth: token })
    const res = await octokit.request('GET /repos/{owner}/{repo}/releases', { owner, repo, per_page: perRepo })
    return (res.data as OctokitRelease[]).map((release) => mapRelease(repoFullName, release))
  } catch {
    // Missing contents:read, no releases, or transient error — degrade to empty.
    return []
  }
}

/** Recent releases across repos, newest first. Each repo failure degrades to empty. */
export async function getReleasesForRepos(
  pairs: Array<{ installationId: number; repoFullName: string }>,
  perRepo = 3,
  limit = 8,
): Promise<ReleaseSummary[]> {
  const limited = pairs.slice(0, 25)
  const all = await Promise.all(limited.map((pair) => getRepoReleases(pair.installationId, pair.repoFullName, perRepo)))
  return all
    .flat()
    .sort((a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''))
    .slice(0, limit)
}
