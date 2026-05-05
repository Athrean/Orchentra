import { OperationError, type Operation, type OperationContext } from './types'

/**
 * Single shared entrypoint that the in-process agent loop, MCP server, CLI, and
 * future HTTP API all funnel through. Validates input against the op's Zod schema,
 * enforces the trust boundary, then runs the handler.
 *
 * Trust boundary:
 *   - localOnly && remote !== false  -> permission_denied
 *   - (write|admin) && remote !== false && no approval -> permission_denied
 *   - read && remote === true        -> allowed (audit seam reserved for 1B)
 */
export async function dispatch<TParams, TOutput>(
  operation: Operation<TParams, TOutput>,
  ctx: OperationContext,
  rawParams: unknown,
): Promise<TOutput> {
  if (operation.localOnly && ctx.remote !== false) {
    throw new OperationError({
      code: 'permission_denied',
      message: `Operation '${operation.id}' is local-only and cannot be invoked by a remote caller.`,
    })
  }

  if ((operation.scope === 'write' || operation.scope === 'admin') && ctx.remote !== false && !ctx.approval) {
    throw new OperationError({
      code: 'permission_denied',
      message: `Operation '${operation.id}' requires explicit approval for remote callers.`,
    })
  }

  if (!ctx.allowedScopes.has(operation.scope)) {
    throw new OperationError({
      code: 'permission_denied',
      message: `Operation '${operation.id}' scope '${operation.scope}' is not in caller's allowed scopes.`,
    })
  }

  const parsed = operation.parameters.safeParse(rawParams)
  if (!parsed.success) {
    throw new OperationError({
      code: 'invalid_input',
      message: `Invalid input for '${operation.id}': ${parsed.error.message}`,
    })
  }

  return operation.handler(ctx, parsed.data)
}
