import type { Operation, OperationContext, OperationScope } from './types'

/**
 * Trust class is the gate-class an op runs under. It's derived from `scope`
 * unless an op explicitly overrides it via `Operation.trustClass`.
 *
 *   - `read`        → no approval ever, on any transport.
 *   - `write`       → single approval required when `ctx.remote === true`.
 *   - `destructive` → single approval required, AND the approver must be a
 *                     different actor than the requester (no self-approval).
 *
 * The legacy `scope` lives on for ergonomic CLI hints + back-compat. Trust
 * class is what the dispatcher's gate consults.
 */
export type OperationTrustClass = 'read' | 'write' | 'destructive'

/**
 * Compact actor descriptor used by approval persistence + the
 * second-approver rule. Transports populate this; the operations package
 * does not assume any particular auth shape.
 */
export interface ApprovalActor {
  id: string
  type?: 'user' | 'agent' | 'system'
}

export interface ApprovalRequestSnapshot {
  /** The op being gated. */
  operationId: string
  /** Parsed (Zod-validated) input that will be passed to the handler. */
  input: unknown
  /** Free-form context the host provides — diff text, repo URL, etc. */
  metadata?: Record<string, unknown>
}

export interface ApprovalDecision {
  status: 'approved' | 'denied' | 'expired'
  /** Populated for approved/denied; absent for expired. */
  decidedBy?: ApprovalActor
}

/**
 * Resolve the effective trust class for an op. `Operation.trustClass`, when
 * set, wins; otherwise we fall back to scope-derived defaults.
 */
export function resolveTrustClass(op: {
  scope: OperationScope
  trustClass?: OperationTrustClass
}): OperationTrustClass {
  if (op.trustClass) return op.trustClass
  if (op.scope === 'read') return 'read'
  // `write` and `admin` both default to single-approval `write` trust class.
  // Ops that need the second-approver rule must declare `trustClass:
  // 'destructive'` explicitly — the dispatcher does NOT promote scope='admin'
  // to destructive automatically (admin ops vary too widely).
  return 'write'
}

/**
 * The dispatcher's gate predicate. Returns `true` iff the op needs to clear
 * the approval gate before its handler runs.
 *
 * Read-class ops never need approval. Local callers (`ctx.remote === false`)
 * never need approval either — they've already cleared the local trust
 * boundary by being able to invoke `dispatch` at all.
 */
export function requiresApproval<TParams, TResult>(op: Operation<TParams, TResult>, ctx: OperationContext): boolean {
  const trustClass = resolveTrustClass(op)
  if (trustClass === 'read') return false
  if (ctx.remote === false) return false
  return true
}

/**
 * Enforce the second-approver rule for `destructive` trust class.
 *
 * Returns an `OperationErrorPayload`-shaped object when the actor is not
 * allowed to approve this request, or `null` when the actor is cleared. The
 * caller (`/api/approvals/:id/ack` route) wraps the payload into the route's
 * 4xx response and skips the store update.
 *
 * V1 rule: for destructive ops, the approver's `id` must differ from the
 * requester's `id`. There's no role/permission table yet; that lands when
 * per-policy approval routing ships.
 */
export function validateActorCanApprove(
  approver: ApprovalActor,
  request: { trustClass: OperationTrustClass; requestedBy: ApprovalActor },
): { code: 'permission_denied'; message: string } | null {
  if (request.trustClass !== 'destructive') return null
  if (approver.id === request.requestedBy.id) {
    return {
      code: 'permission_denied',
      message: `destructive ops require a second approver — ${approver.id} cannot approve their own request`,
    }
  }
  return null
}
