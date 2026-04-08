import { eq, and, sql } from 'drizzle-orm'
import { db, webhookEvents } from '../db/client'

interface InsertWebhookEvent {
  id: string
  provider: string
  eventId: string
  eventType: string | null
  payload: unknown
}

/**
 * Persist a webhook event. Returns the row if inserted, or `null` if the
 * (provider, event_id) pair already exists (cold-path dedup).
 */
export async function insertWebhookEvent(
  values: InsertWebhookEvent,
): Promise<typeof webhookEvents.$inferSelect | null> {
  const [row] = await db
    .insert(webhookEvents)
    .values({
      ...values,
      status: 'pending',
    })
    .onConflictDoNothing()
    .returning()
  return row ?? null
}

/** Mark a webhook event as successfully processed. */
export async function markWebhookProcessed(id: string): Promise<void> {
  await db.update(webhookEvents).set({ status: 'processed', processedAt: new Date() }).where(eq(webhookEvents.id, id))
}

/** Mark a webhook event as failed, recording the error and incrementing retry count. */
export async function markWebhookFailed(id: string, error: string): Promise<void> {
  await db
    .update(webhookEvents)
    .set({
      status: 'failed',
      error,
      retryCount: sql`${webhookEvents.retryCount} + 1`,
    })
    .where(eq(webhookEvents.id, id))
}

/** Mark a webhook event as skipped (e.g. unmonitored repo, non-failure conclusion). */
export async function markWebhookSkipped(id: string): Promise<void> {
  await db.update(webhookEvents).set({ status: 'skipped' }).where(eq(webhookEvents.id, id))
}

/** Find failed webhook events eligible for replay. */
export async function findFailedWebhookEvents(
  provider: string,
  limit: number = 50,
): Promise<Array<typeof webhookEvents.$inferSelect>> {
  return db
    .select()
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.status, 'failed')))
    .orderBy(webhookEvents.receivedAt)
    .limit(limit)
}

/** Reset a failed webhook event to pending so it can be reprocessed. */
export async function resetWebhookForReplay(id: string): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ status: 'pending', error: null })
    .where(and(eq(webhookEvents.id, id), eq(webhookEvents.status, 'failed')))
}
