/**
 * In-memory hot-path deduplication for webhook deliveries.
 *
 * GitHub may deliver the same event multiple times concurrently. This Map
 * coalesces duplicate in-flight requests so only one actually processes.
 * The DB unique index on (provider, event_id) acts as the cold-path backup.
 */

/** Tracks in-flight webhook processing promises keyed by `provider:eventId`. */
const inFlight = new Map<string, Promise<void>>()

/** Recently settled event IDs kept for a short TTL to catch fast retries. */
const settled = new Map<string, number>()

const SETTLED_TTL_MS = 60_000

function buildKey(provider: string, eventId: string): string {
  return `${provider}:${eventId}`
}

/**
 * Returns `true` if this event is already being processed or was recently settled.
 * If not a duplicate, registers the processing promise so concurrent duplicates
 * are detected.
 */
export function isDuplicateInFlight(provider: string, eventId: string): boolean {
  const key = buildKey(provider, eventId)

  if (inFlight.has(key)) return true

  const settledAt = settled.get(key)
  if (settledAt && Date.now() - settledAt < SETTLED_TTL_MS) return true

  return false
}

/**
 * Register a processing promise for this event. Call `settle()` when done.
 */
export function registerInFlight(provider: string, eventId: string, promise: Promise<void>): void {
  const key = buildKey(provider, eventId)
  inFlight.set(key, promise)

  promise.finally(() => {
    inFlight.delete(key)
    settled.set(key, Date.now())
  })
}

/** Periodic cleanup of expired settled entries. */
function pruneSettled(): void {
  const now = Date.now()
  for (const [key, ts] of settled) {
    if (now - ts >= SETTLED_TTL_MS) settled.delete(key)
  }
}

setInterval(pruneSettled, SETTLED_TTL_MS)
