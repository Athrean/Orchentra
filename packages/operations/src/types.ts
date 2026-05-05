import type { z } from 'zod'

export type OperationScope = 'read' | 'write' | 'admin'

export type OperationErrorCode =
  | 'invalid_input'
  | 'permission_denied'
  | 'not_found'
  | 'upstream_error'
  | 'internal_error'

export interface OperationErrorPayload {
  code: OperationErrorCode
  message: string
  suggestion?: string
  docs?: string
}

/**
 * Approval callback invoked by `dispatch` before running a `write`- or
 * `admin`-scoped op on a remote-trust ctx. When it returns `true`, dispatch
 * proceeds; otherwise the call is rejected with `permission_denied`. This is
 * the escape hatch that lets HTTP/hosted transports run mutating ops without
 * weakening the `remote: true` trust posture itself.
 */
export type ApprovalCallback = <TParams, TResult>(op: Operation<TParams, TResult>, params: TParams) => Promise<boolean>

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
