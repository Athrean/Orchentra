/**
 * Normalize a spec argument by filling in the active repo when the user
 * supplied an abbreviated form. The caller still validates the result with
 * the strict parsers in `./spec.ts`; this layer just rewrites shortcuts:
 *
 *   "owner/repo#runId"  → unchanged
 *   "owner/repo"        → unchanged
 *   "#runId" / "42"     → `${activeRepo}#${runId}` when activeRepo set
 *   "" or undefined     → activeRepo
 *
 * When the input requires the active repo but none is set, returns null so
 * the caller can render an actionable error (e.g. "run /repos first").
 * Malformed input (anything that doesn't match these shapes) is returned
 * unchanged so the strict parser raises the diagnostic the user expects.
 */
export function expandSpec(arg: string | undefined, activeRepo: string | null): string | null {
  const trimmed = (arg ?? '').trim()
  if (trimmed.length === 0) return activeRepo
  if (trimmed.startsWith('#')) {
    const runId = trimmed.slice(1)
    if (!activeRepo) return null
    return `${activeRepo}#${runId}`
  }
  if (/^\d+$/.test(trimmed)) {
    if (!activeRepo) return null
    return `${activeRepo}#${trimmed}`
  }
  return trimmed
}
