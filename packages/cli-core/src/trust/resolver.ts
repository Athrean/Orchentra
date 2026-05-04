import { sep } from 'node:path'
import type { TrustStatus, TrustStore } from './store'

export type TrustDecision = TrustStatus | 'prompt'

export function resolveTrust(cwd: string, store: TrustStore): TrustDecision {
  const { trusted, denied } = store.list()
  if (anyAncestorMatches(cwd, denied)) return 'denied'
  if (anyAncestorMatches(cwd, trusted)) return 'trusted'
  return 'prompt'
}

function anyAncestorMatches(cwd: string, roots: readonly string[]): boolean {
  const c = stripTrailingSep(cwd)
  for (const root of roots) {
    const r = stripTrailingSep(root)
    if (c === r) return true
    if (c.startsWith(r + sep)) return true
  }
  return false
}

function stripTrailingSep(p: string): string {
  return p.length > 1 && p.endsWith(sep) ? p.slice(0, -1) : p
}
