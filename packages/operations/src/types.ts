import type { ZodSchema } from 'zod'

export type OperationScope = 'read' | 'write' | 'admin'

export type OperationErrorCode =
  | 'permission_denied'
  | 'invalid_input'
  | 'not_found'
  | 'upstream_error'
  | 'internal_error'

export interface OperationErrorPayload {
  code: OperationErrorCode
  message: string
  suggestion?: string
  docs?: string
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
 * The trust-marked envelope every dispatch call must carry.
 *
 * `remote` is REQUIRED at the type level. Any new transport that forgets
 * to set it will fail to compile. The dispatch gate uses strict equality
 * (`=== false`) when reading this field — see `dispatch.ts` for why.
 *
 * Seams reserved for Phase 1B (auth, approval, audit, creds, brain) are
 * declared as optional today so callers can begin populating them without
 * a breaking change when the gates that consume them ship.
 */
export interface OperationContext {
  remote: boolean
  allowedScopes?: ReadonlySet<OperationScope>
  auth?: unknown
  approval?: unknown
  audit?: unknown
  creds?: unknown
  brain?: unknown
}

export interface OperationCliHints {
  name?: string
  aliases?: readonly string[]
  hidden?: boolean
}

export interface Operation<TParams = unknown, TResult = unknown> {
  id: string
  description: string
  scope: OperationScope
  mutating: boolean
  localOnly: boolean
  parameters: ZodSchema<TParams>
  output?: ZodSchema<TResult>
  cliHints?: OperationCliHints
  handler: (ctx: OperationContext, params: TParams) => Promise<TResult>
}
