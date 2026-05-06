import type { z } from 'zod'

export type OperationScope = 'read' | 'write' | 'admin'

export type OperationErrorCode =
  | 'invalid_input'
  | 'permission_denied'
  | 'not_found'
  | 'upstream_error'
  | 'internal_error'
  | 'awaiting_approval'

export interface OperationErrorPayload {
  code: OperationErrorCode
  message: string
  suggestion?: string
  docs?: string
}

/**
 * Result of consulting an approval callback for one dispatch call.
 *
 *   - `approved`         — handler runs.
 *   - `denied`           — dispatch throws permission_denied.
 *   - `awaiting_approval` — dispatch throws an `awaiting_approval` error
 *                            carrying the persisted approval id, so the
 *                            transport can hand it back to the caller and
 *                            let them poll/re-invoke. Used by the MCP HTTP
 *                            transport so the request itself doesn't long-
 *                            poll the server.
 */
export type ApprovalDecisionStatus = 'approved' | 'denied' | 'awaiting_approval'

export interface ApprovalDecisionResult {
  status: ApprovalDecisionStatus
  /** Populated when status === 'awaiting_approval'. */
  approvalId?: string
  /** Optional ISO-8601 expiry to surface to the caller. */
  expiresAt?: string
  /** Human-readable reason (denied/awaiting). */
  reason?: string
}

/**
 * Approval callback invoked by `dispatch` before running an op whose
 * trust class requires approval (see `requiresApproval` in `trust.ts`).
 *
 * Returning a boolean is the legacy short form — `true` ≈ `{status:'approved'}`,
 * `false` ≈ `{status:'denied'}`. New transports should return the structured
 * `ApprovalDecisionResult` so the dispatcher can surface `awaiting_approval`
 * to the caller without blocking on a long-poll.
 */
export type ApprovalCallbackResult = boolean | ApprovalDecisionResult
export type ApprovalCallback = <TParams, TResult>(
  op: Operation<TParams, TResult>,
  params: TParams,
) => Promise<ApprovalCallbackResult>

/**
 * Carrier for handler execution context. `remote` is REQUIRED so the compiler
 * forces every transport to declare its trust posture explicitly. The optional
 * fields are seams reserved for follow-up slices (auth, audit, creds, brain).
 *
 * `approval` is checked by `dispatch` only when `remote === true` AND the op
 * is `write`- or `admin`-scoped. Local callers (`remote: false`) never hit
 * the approval gate. `localOnly` ops are not approval-bypassable.
 */
export interface OperationContext {
  remote: boolean
  allowedScopes: Set<OperationScope>
  auth?: unknown
  approval?: ApprovalCallback
  audit?: unknown
  creds?: unknown
  brain?: unknown
}

export interface OperationCliHints {
  name?: string
  aliases?: string[]
  hidden?: boolean
}

export interface Operation<TParams = unknown, TResult = unknown> {
  id: string
  description: string
  scope: OperationScope
  /**
   * Trust class — what gate the dispatcher applies. Defaults to scope-derived:
   *   read  → 'read', write/admin → 'write'. Ops that need the second-approver
   *   rule must opt in explicitly with `trustClass: 'destructive'`.
   * Imported lazily here as a string union to avoid a circular import with
   * `trust.ts`; the canonical type is exported as `OperationTrustClass`.
   */
  trustClass?: 'read' | 'write' | 'destructive'
  localOnly: boolean
  mutating: boolean
  parameters: z.ZodType<TParams>
  output?: z.ZodType<TResult>
  cliHints?: OperationCliHints
  handler: (ctx: OperationContext, params: TParams) => Promise<TResult>
}

export class OperationError extends Error {
  readonly code: OperationErrorCode
  readonly suggestion?: string
  readonly docs?: string

  constructor(payload: OperationErrorPayload) {
    super(payload.message)
    this.name = 'OperationError'
    this.code = payload.code
    this.suggestion = payload.suggestion
    this.docs = payload.docs
  }

  toJSON(): OperationErrorPayload {
    const out: OperationErrorPayload = { code: this.code, message: this.message }
    if (this.suggestion !== undefined) out.suggestion = this.suggestion
    if (this.docs !== undefined) out.docs = this.docs
    return out
  }
}

/**
 * Wrap any thrown value into an `OperationError` so transports always
 * serialize through the same `toJSON` contract. Existing `OperationError`
 * instances pass through unchanged; everything else becomes
 * `internal_error` with a best-effort message.
 */
export function toOperationError(thrown: unknown): OperationError {
  if (thrown instanceof OperationError) return thrown
  const message = thrown instanceof Error ? thrown.message : typeof thrown === 'string' ? thrown : 'unknown error'
  return new OperationError({ code: 'internal_error', message })
}
