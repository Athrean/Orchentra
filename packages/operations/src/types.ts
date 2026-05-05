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
 * Carrier for handler execution context. `remote` is REQUIRED so the compiler
 * forces every transport to declare its trust posture explicitly. The optional
 * fields are seams reserved for the next slice (auth, approval, audit, creds,
 * brain) and are unused today.
 */
export interface OperationContext {
  remote: boolean
  allowedScopes: Set<OperationScope>
  auth?: unknown
  approval?: unknown
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
