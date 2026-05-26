import { and, eq } from 'drizzle-orm'
import { db } from '../client'
import { repoSubscriptions, type RepoSubscription } from '../schema'

export async function getUserSubscriptions(userId: string): Promise<RepoSubscription[]> {
  return db
    .select()
    .from(repoSubscriptions)
    .where(and(eq(repoSubscriptions.userId, userId), eq(repoSubscriptions.enabled, true)))
}
