/**
 * Suspendable approval gate. `awaitApproval(id, opts)` resolves when the
 * persisted row in `approval_requests` transitions out of `pending` — by
 * human ack, denial, or expiry.
 *
 * Implementation is a poll loop with linear backoff capped at 2s. The CLI
 * blocks the local process on this; the MCP HTTP transport does NOT call
 * this on the request-handling thread. (The HTTP gate persists the request,
 * returns `awaiting_approval` immediately, and lets the agent re-invoke or
 * poll the public GET endpoint.)
 *
 * Cancellation: caller passes an AbortSignal. When aborted, the promise
 * resolves with `{ status: 'cancelled' }` so the caller can clean up
 * without an exception.
 */

import { findApprovalRequestInternal } from './store'
import type { ApprovalActor } from '@orchentra/operations'

export interface AwaitApprovalOptions {
  signal?: AbortSignal
  /** Initial poll interval in ms. Doubles each iteration up to `maxIntervalMs`. Default 100ms. */
  initialIntervalMs?: number
  /** Cap for the backoff. Default 2000ms. */
  maxIntervalMs?: number
  /** Hard upper bound on the wait, independent of the row's expiresAt. Defaults to 5min. */
  timeoutMs?: number
  /** Test seam: override the default `setTimeout` so unit tests can run synchronously. */
  sleep?: (ms: number) => Promise<void>
  /** Test seam: override the wall clock. */
  now?: () => number
}

export type AwaitApprovalResult =
  | { status: 'approved'; decidedBy: ApprovalActor; decidedAt: Date }
  | { status: 'denied'; decidedBy: ApprovalActor; decidedAt: Date }
  | { status: 'expired' }
  | { status: 'cancelled' }
  | { status: 'not_found' }
  | { status: 'timeout' }

const DEFAULT_TIMEOUT_MS = (() => {
  const raw = process.env.ORCHENTRA_APPROVAL_TIMEOUT_MS
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5 * 60 * 1000
})()

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export async function awaitApproval(approvalId: string, opts: AwaitApprovalOptions = {}): Promise<AwaitApprovalResult> {
  const initial = opts.initialIntervalMs ?? 100
  const cap = opts.maxIntervalMs ?? 2000
  const totalBudget = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const sleep = opts.sleep ?? defaultSleep
  const now = opts.now ?? Date.now
  const start = now()

  let interval = initial

  while (true) {
    if (opts.signal?.aborted) return { status: 'cancelled' }
    if (now() - start >= totalBudget) return { status: 'timeout' }

    const row = await findApprovalRequestInternal(approvalId)
    if (!row) return { status: 'not_found' }

    if (row.status === 'approved' || row.status === 'denied') {
      // Both branches require decidedBy/decidedAt; the store guarantees both
      // are populated for non-pending statuses other than 'expired'.
      if (!row.decidedBy || !row.decidedAt) return { status: 'expired' }
      return { status: row.status, decidedBy: row.decidedBy, decidedAt: row.decidedAt }
    }
    if (row.status === 'expired') return { status: 'expired' }

    // Still pending. If the row has aged past its server-side expiry, treat
    // as expired even before the next sweep runs.
    if (row.expiresAt.getTime() <= now()) return { status: 'expired' }

    await sleep(interval)
    interval = Math.min(interval * 2, cap)
  }
}
