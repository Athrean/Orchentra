import type { z } from 'zod'

export type OperationScope = 'read' | 'write' | 'admin'

export type ErrorCode = 'permission_denied' | 'invalid_input' | 'handler_error' | 'unknown'

export interface OperationCliHints {
  name?: string
  aliases?: string[]
  hidden?: boolean
}

export interface OperationContext {
  /**
   * REQUIRED. True when the caller is a remote MCP agent; false for local CLI.
   * Encoded as required (no default) so any new transport that forgets the
   * trust flag fails to type-check.
   */
  remote: boolean
  /** Scopes this caller is allowed to invoke. */
  allowedScopes: Set<OperationScope>
  // Reserved seams for Phase 1B. Stub today, real implementations later.
  auth?: unknown
  approval?: unknown
  audit?: unknown
  creds?: unknown
  brain?: unknown
}

export interface Operation<TParams = unknown, TOutput = unknown> {
  id: string
  description: string
  scope: OperationScope
  localOnly: boolean
  mutating: boolean
  parameters: z.ZodType<TParams>
  output?: z.ZodType<TOutput>
  cliHints?: OperationCliHints
  handler: (ctx: OperationContext, params: TParams) => Promise<TOutput>
}

export interface OperationErrorJson {
  code: ErrorCode
  message: string
  suggestion?: string
  docs?: string
}

export class OperationError extends Error {
  readonly code: ErrorCode
  readonly suggestion?: string
  readonly docs?: string

  constructor(args: { code: ErrorCode; message: string; suggestion?: string; docs?: string }) {
    super(args.message)
    this.name = 'OperationError'
    this.code = args.code
    this.suggestion = args.suggestion
    this.docs = args.docs
  }

  toJSON(): OperationErrorJson {
    const out: OperationErrorJson = { code: this.code, message: this.message }
    if (this.suggestion !== undefined) out.suggestion = this.suggestion
    if (this.docs !== undefined) out.docs = this.docs
    return out
  }
}
