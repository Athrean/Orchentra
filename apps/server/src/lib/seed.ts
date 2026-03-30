import { db, monitoredRepos, organizations } from '../db/client'
import { config } from '../config'

export async function seedMonitoredRepos(): Promise<void> {
  const existing = await db.select({ id: monitoredRepos.id }).from(monitoredRepos).limit(1)
  if (existing.length > 0) return

  const repos = [...new Set(config.github.repos.map((r) => r.toLowerCase()))]
  if (repos.length === 0) return

  // Seeding requires an org to exist; skip if none has been created yet
  const firstOrg = await db.select({ id: organizations.id }).from(organizations).limit(1)
  if (firstOrg.length === 0) return

  const orgId = firstOrg[0].id

  await db.insert(monitoredRepos).values(
    repos.map((repo) => ({
      id: crypto.randomUUID(),
      orgId,
      repo,
      addedBy: null,
    })),
  )
  console.log(`Seeded ${repos.length} repos from config into monitoredRepos`)
}
