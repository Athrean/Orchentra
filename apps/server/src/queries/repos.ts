import { eq, and } from 'drizzle-orm'
import { db, monitoredRepos } from '../db/client'

export async function getOrgMonitoredRepos(orgId: string): Promise<{ repo: string }[]> {
  return db.select({ repo: monitoredRepos.repo }).from(monitoredRepos).where(eq(monitoredRepos.orgId, orgId))
}

export async function insertMonitoredRepo(orgId: string, repo: string, addedBy: string): Promise<void> {
  await db.insert(monitoredRepos).values({ id: crypto.randomUUID(), orgId, repo, addedBy }).onConflictDoNothing()
}

export async function deleteMonitoredRepo(orgId: string, repo: string): Promise<{ id: string }[]> {
  return db
    .delete(monitoredRepos)
    .where(and(eq(monitoredRepos.repo, repo), eq(monitoredRepos.orgId, orgId)))
    .returning({ id: monitoredRepos.id })
}
