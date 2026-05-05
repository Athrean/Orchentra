/**
 * Stable JSON shape returned by `OperationError.toJSON()`.
 *
 * This shape is part of the public contract consumed by every transport
 * that surfaces operation failures (CLI command path, MCP `tools/call`,
 * future HTTP API). Calling agents (Claude Code, Cursor, Windsurf, our
 * own in-process loop) parse this body to decide whether to self-recover
 * (`invalid_params` → re-prompt with corrected args) or escalate
 * (`internal_error` → surface to the user).
 *
 * The shape is FROZEN. Adding a field is a deliberate version bump,
 * not a drive-by edit, because byte-stable JSON is the contract.
 */
export interface OperationErrorJson {
  code: string
  message: string
  suggestion?: string
  docs?: string
}

/**
 * Stable error code used when wrapping a non-`OperationError` throw
 * (generic `Error`, `TypeError`, thrown string, etc.) before
 * serializing it through the same `toJSON` path. Keeps the contract
 * tight: every error a caller sees has a code from a known vocabulary.
 */
export const INTERNAL_ERROR_CODE = 'internal_error'

export class OperationError extends Error {
  readonly code: string
  readonly suggestion?: string
  readonly docs?: string

  constructor(code: string, message: string, suggestion?: string, docs?: string) {
    super(message)
    this.name = 'OperationError'
    this.code = code
    if (suggestion !== undefined) this.suggestion = suggestion
    if (docs !== undefined) this.docs = docs
  }

  /**
   * Returns the stable, byte-stable JSON shape. Field order is fixed
   * (code, message, suggestion, docs) so two transports serializing
   * the same error produce byte-identical output. Optional fields are
   * omitted when unset (never serialized as `null` or `undefined`).
   *
   * Internal fields (`stack`, `name`) are NEVER leaked.
   */
  toJSON(): OperationErrorJson {
    const out: OperationErrorJson = {
      code: this.code,
      message: this.message,
    }
    if (this.suggestion !== undefined) out.suggestion = this.suggestion
    if (this.docs !== undefined) out.docs = this.docs
    return out
  }
}

/**
 * Wrap any thrown value into an `OperationError` so the serialization
 * contract holds. If the value is already an `OperationError` it is
 * returned as-is; everything else becomes `internal_error` carrying
 * a best-effort message extracted from the thrown value.
 */
export function toOperationError(thrown: unknown): OperationError {
  if (thrown instanceof OperationError) return thrown
  const message = thrown instanceof Error ? thrown.message : typeof thrown === 'string' ? thrown : 'unknown error'
  return new OperationError(INTERNAL_ERROR_CODE, message)
}
