import { Octokit } from '@octokit/rest'
import { db, monitoredRepos } from '../db/client'
import { config } from '../config'

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const DEFAULT_TTL_MS = 60_000

let monitoredCache: CacheEntry<Set<string>> | null = null
let availableCache: CacheEntry<AvailableRepo[]> | null = null

interface AvailableRepo {
  fullName: string
  owner: string
  name: string
  private: boolean
  description: string | null
}

export async function getMonitoredRepos(): Promise<ReadonlySet<string>> {
  if (monitoredCache && Date.now() < monitoredCache.expiresAt) {
    return monitoredCache.data
  }

  const rows = await db.select({ repo: monitoredRepos.repo }).from(monitoredRepos)
  const repoSet = new Set(rows.map((r) => r.repo.toLowerCase()))

  monitoredCache = { data: repoSet, expiresAt: Date.now() + DEFAULT_TTL_MS }
  return repoSet
}

export function invalidateMonitoredReposCache(): void {
  monitoredCache = null
}

export async function getAvailableRepos(userToken?: string | null): Promise<AvailableRepo[]> {
  // Only use cache when using the default app token (user tokens vary per user)
  if (!userToken && availableCache && Date.now() < availableCache.expiresAt) {
    return availableCache.data
  }

  const octokit = new Octokit({ auth: userToken ?? config.github.token })
  const repos: AvailableRepo[] = []

  for await (const response of octokit.paginate.iterator(octokit.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: 'full_name',
  })) {
    for (const repo of response.data) {
      repos.push({
        fullName: repo.full_name,
        owner: repo.owner.login,
        name: repo.name,
        private: repo.private,
        description: repo.description ?? null,
      })
    }
  }

  // Only cache for app-token requests
  if (!userToken) {
    availableCache = { data: repos, expiresAt: Date.now() + DEFAULT_TTL_MS }
  }
  return repos
}

export function invalidateAvailableReposCache(): void {
  availableCache = null
}

export async function isRepoMonitored(fullName: string): Promise<boolean> {
  const monitored = await getMonitoredRepos()
  return monitored.has(fullName.toLowerCase())
}
