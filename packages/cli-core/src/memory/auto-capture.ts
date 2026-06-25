import { failureSignature } from './failure-signature'
import { recordResolvedPattern, type MemoryDeps } from './service'

export interface CaptureTurnInput {
  orgId: string
  /** The user's message — treated as the failure context. */
  userMessage: string
  /** The agent's final answer — recorded as the resolution. */
  resolution: string
  workflowName?: string
  branch?: string
}

export type CaptureReceipt =
  | { status: 'saved'; entryId: string; signatureHash: string }
  | { status: 'skipped'; reason: 'not_failure' | 'empty' | 'duplicate'; signatureHash: string }

// Deterministic failure detector — the gate that keeps auto-capture on-thesis
// (operational/failure memory) and quiet on ordinary coding turns. No LLM.
const FAILURE_MARKERS =
  /\b(error|errors|failed|failure|exception|traceback|panic|segfault|stack ?trace|exit code|ENOENT|ECONN|npm ERR|fatal|assertion|✗|FAILED?)\b/i

export function looksLikeFailure(text: string): boolean {
  return FAILURE_MARKERS.test(text)
}

function truncate(text: string, max: number): string {
  const flat = text.trim()
  return flat.length > max ? flat.slice(0, max) + '…' : flat
}

/**
 * Capture a failure→resolution memory from a completed, successful turn.
 * Deterministic and non-destructive: only failure-shaped turns are recorded,
 * deduped by failure signature. The caller is responsible for gating on
 * `memory.enabled` and for swallowing errors (embedding may be unavailable).
 */
export async function captureMemoryFromTurn(
  deps: MemoryDeps,
  input: CaptureTurnInput,
  now: () => Date = () => new Date(),
): Promise<CaptureReceipt> {
  const sig = failureSignature({ workflowName: input.workflowName, log: input.userMessage })

  if (!looksLikeFailure(input.userMessage)) {
    return { status: 'skipped', reason: 'not_failure', signatureHash: sig.hash }
  }
  if (input.resolution.trim().length === 0) {
    return { status: 'skipped', reason: 'empty', signatureHash: sig.hash }
  }

  const result = await recordResolvedPattern(
    deps,
    {
      orgId: input.orgId,
      incidentId: sig.hash,
      workflowName: input.workflowName ?? 'session',
      branch: input.branch ?? 'unknown',
      rootCause: truncate(input.userMessage, 500),
      suggestedFix: truncate(input.resolution, 1000),
      signatureHash: sig.hash,
      failureType: 'unknown',
    },
    now,
  )

  if (result.saved && result.entry) {
    return { status: 'saved', entryId: result.entry.id, signatureHash: sig.hash }
  }
  return { status: 'skipped', reason: 'duplicate', signatureHash: sig.hash }
}
