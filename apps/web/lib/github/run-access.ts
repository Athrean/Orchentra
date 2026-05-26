import { getUserSubscriptions } from '../db/queries/subscriptions'
import type { RepoSubscription } from '../db/schema'

type SubscriptionScope = Pick<RepoSubscription, 'installationId' | 'repoFullName'>

export function subscriptionMatches(subs: SubscriptionScope[], installationId: number, repoFullName: string): boolean {
  return subs.some((s) => s.installationId === installationId && s.repoFullName === repoFullName)
}

/**
 * The real access boundary for run detail. Drizzle connects as the postgres
 * superuser (bypasses RLS), so this app-layer check by user id is the guard
 * that keeps a user from reading a run for a repo they do not subscribe to.
 */
export async function assertRepoAccess(userId: string, installationId: number, repoFullName: string): Promise<boolean> {
  const subs = await getUserSubscriptions(userId)
  return subscriptionMatches(subs, installationId, repoFullName)
}
