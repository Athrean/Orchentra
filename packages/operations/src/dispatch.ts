import { OperationError, toOperationError } from './operation-error'
import type { Operation, OperationContext } from './types'

/**
 * Single shared entry point used by every transport that fronts an
 * operation (CLI, MCP, future HTTP). Keeping dispatch in one place
 * is what guarantees behaviour parity across transports — including
 * how thrown values become `OperationError` instances. Both transports
 * then serialize the result via the same `OperationError.toJSON()`
 * contract.
 *
 * Returns a discriminated union rather than throwing so callers can
 * branch on success/failure without try/catch noise at every call
 * site.
 */
export type DispatchResult<Result> = { ok: true; value: Result } | { ok: false; error: OperationError }

export async function dispatch<Params, Result>(
  operation: Operation<Params, Result>,
  ctx: OperationContext,
  params: Params,
): Promise<DispatchResult<Result>> {
  try {
    const value = await operation.handler(ctx, params)
    return { ok: true, value }
  } catch (thrown) {
    return { ok: false, error: toOperationError(thrown) }
  }
}
