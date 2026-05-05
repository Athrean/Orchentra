/**
 * Foundation stubs for the Operation contract.
 *
 * The full contract (scope, mutating, parameters, output, cliHints,
 * trust boundary enforcement) lands with slice #290. This file
 * carries only the minimum shape required to express a single shared
 * dispatch path — enough for the byte-stable error serialization
 * contract in slice #293 to be exercised end-to-end.
 *
 * When #290 merges, conflict resolution should keep #290's richer
 * Operation/OperationContext shape; the only invariant this slice
 * relies on is that `OperationContext.remote: boolean` is REQUIRED
 * at the type level.
 */

export type OperationScope = 'read' | 'write' | 'admin'

export interface OperationContext {
  /**
   * REQUIRED. `false` for trusted local CLI callers, `true` for any
   * remote-agent-originated call (MCP today; HTTP tomorrow). The
   * compiler enforces presence so a new transport cannot silently
   * default to "trusted".
   */
  readonly remote: boolean
}

export interface Operation<Params = unknown, Result = unknown> {
  readonly id: string
  readonly handler: (ctx: OperationContext, params: Params) => Promise<Result>
}
