import { OperationError, type Operation, type OperationContext } from './types'

/**
 * Run an operation under the trust gate.
 *
 * The gate is fail-closed by design: the only way through for a
 * write- or admin-scoped op is `ctx.remote === false`. Anything that
 * is not strictly the boolean `false` — undefined, null, the string
 * "false", a missing field on a malformed runtime caller — is treated
 * as remote/untrusted. The strict equality is the security property;
 * a falsy check would let `remote: undefined` slip through.
 */
export async function dispatch<TParams, TResult>(
  op: Operation<TParams, TResult>,
  ctx: OperationContext,
  params: TParams,
): Promise<TResult> {
  const trusted = ctx.remote === false

  if (op.localOnly && !trusted) {
    throw new OperationError({
      code: 'permission_denied',
      message: `Operation '${op.id}' is local-only and cannot be invoked by a remote caller.`,
      suggestion: 'Invoke this operation from the local CLI process.',
    })
  }

  if ((op.scope === 'write' || op.scope === 'admin') && !trusted) {
    throw new OperationError({
      code: 'permission_denied',
      message: `Operation '${op.id}' requires a trusted local caller or an approved request.`,
      suggestion: 'Run this operation from the local CLI, or grant an explicit approval before retrying.',
    })
  }

  const parsed = op.parameters.parse(params)
  return op.handler(ctx, parsed)
}
