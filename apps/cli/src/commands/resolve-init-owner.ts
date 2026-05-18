/**
 * Three-step owner resolution for `orchentra init`:
 *   1. An explicit `--owner=<o>` always wins.
 *   2. Otherwise infer from the current directory's git origin.
 *   3. Otherwise interactively prompt the user.
 *
 * An empty prompt response surfaces as null so the caller can exit 1
 * with a clear "owner required" message rather than launching the
 * bootstrap flow with no identity. All side-effects (git probe + tty
 * prompt) flow through injected seams so the resolver is unit-testable
 * without spawning processes or driving readline.
 */

import type { GitHubRepo } from '../util/git-owner'

export interface ResolveInitOwnerDeps {
  readonly explicitOwner?: string
  infer(): GitHubRepo | null
  prompt(): Promise<string>
}

export async function resolveInitOwner(deps: ResolveInitOwnerDeps): Promise<string | null> {
  if (deps.explicitOwner) return deps.explicitOwner
  const inferred = deps.infer()
  if (inferred) return inferred.owner
  const typed = (await deps.prompt()).trim()
  return typed.length > 0 ? typed : null
}
