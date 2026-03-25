import { db, monitoredRepos } from '../db/client'
import { config } from '../config'

export async function seedMonitoredRepos(): Promise<void> {
  const existing = await db.select({ id: monitoredRepos.id }).from(monitoredRepos).limit(1)
  if (existing.length > 0) return

  const repos = [...new Set(config.github.repos.map((r) => r.toLowerCase()))]
  if (repos.length === 0) return

  await db.insert(monitoredRepos).values(
    repos.map((repo) => ({
      id: crypto.randomUUID(),
      repo,
      addedBy: null,
    })),
  )
  console.log(`Seeded ${repos.length} repos from config into monitoredRepos`)
}
