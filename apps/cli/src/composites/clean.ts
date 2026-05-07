import {
  cancelWorkflowRunOperation,
  deleteArtifactOperation,
  dispatch,
  listWorkflowRunsOperation,
  listWorkflowRunArtifactsOperation,
  type OperationContext,
  type OperationScope,
} from '@orchentra/operations'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set<OperationScope>(['read', 'write', 'admin']),
}

export interface CleanOptions {
  owner: string
  repo: string
  olderThanDays?: number
  dryRun?: boolean
  approve: (summary: CleanSummary) => Promise<boolean>
}

export interface CleanSummary {
  oldRuns: Array<{ id: number; conclusion: string | null; updatedAt: string }>
  expiredArtifacts: Array<{ id: number; name: string; runId: number; sizeInBytes: number }>
  totalSizeBytes: number
}

export interface CleanResult {
  cancelled: number[]
  deleted: number[]
  skipped: string[]
  summary: CleanSummary
}

const DEFAULT_OLDER_THAN_DAYS = 14

/**
 * Prune expired GitHub Actions artifacts from old completed-and-failed runs.
 *
 * Algorithm:
 *  1. List recent workflow runs (failure / cancelled / timed_out only).
 *  2. Filter to those updated more than `olderThanDays` ago.
 *  3. For each, fetch its artifacts and collect the ones flagged `expired`.
 *  4. Surface a summary to the caller's approval callback. On approval,
 *     batch-call delete_artifact via dispatch.
 *
 * Cancellation of in-progress runs is intentionally not in scope here —
 * the Slice I op surface keeps the audit trail clean by only mutating
 * what the summary listed. cancelled[] always returns empty for now.
 */
export async function clean(options: CleanOptions): Promise<CleanResult> {
  const olderThanDays = options.olderThanDays ?? DEFAULT_OLDER_THAN_DAYS
  const cutoff = Date.now() - olderThanDays * 86_400_000
  const skipped: string[] = []

  const runsRes = (await dispatch(listWorkflowRunsOperation, localCtx, {
    owner: options.owner,
    repo: options.repo,
    perPage: 100,
  })) as {
    runs?: Array<{ id: number; status: string | null; conclusion: string | null; updatedAt: string }>
    error?: string
  }
  if (runsRes.error || !runsRes.runs) {
    return {
      cancelled: [],
      deleted: [],
      skipped: [`list_workflow_runs: ${runsRes.error ?? 'no payload'}`],
      summary: empty(),
    }
  }

  const oldFailedRuns = runsRes.runs.filter(
    (r) =>
      r.conclusion !== null &&
      ['failure', 'cancelled', 'timed_out'].includes(r.conclusion) &&
      Date.parse(r.updatedAt) < cutoff,
  )

  const expiredArtifacts: CleanSummary['expiredArtifacts'] = []
  let totalSizeBytes = 0

  for (const run of oldFailedRuns) {
    try {
      const artifactsRes = (await dispatch(listWorkflowRunArtifactsOperation, localCtx, {
        owner: options.owner,
        repo: options.repo,
        runId: run.id,
      })) as { artifacts: Array<{ id: number; name: string; sizeInBytes: number; expired: boolean }> }
      for (const a of artifactsRes.artifacts ?? []) {
        if (a.expired) {
          expiredArtifacts.push({ id: a.id, name: a.name, runId: run.id, sizeInBytes: a.sizeInBytes })
          totalSizeBytes += a.sizeInBytes
        }
      }
    } catch (err) {
      skipped.push(`run ${run.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const summary: CleanSummary = {
    oldRuns: oldFailedRuns.map((r) => ({ id: r.id, conclusion: r.conclusion, updatedAt: r.updatedAt })),
    expiredArtifacts,
    totalSizeBytes,
  }

  if (options.dryRun) {
    return { cancelled: [], deleted: [], skipped, summary }
  }

  if (expiredArtifacts.length === 0) {
    return { cancelled: [], deleted: [], skipped: [...skipped, 'no candidates'], summary }
  }

  const approved = await options.approve(summary)
  if (!approved) {
    return { cancelled: [], deleted: [], skipped: [...skipped, 'approval denied'], summary }
  }

  const deleted: number[] = []
  for (const a of expiredArtifacts) {
    try {
      await dispatch(deleteArtifactOperation, localCtx, {
        owner: options.owner,
        repo: options.repo,
        artifactId: a.id,
      })
      deleted.push(a.id)
    } catch (err) {
      skipped.push(`artifact ${a.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  // cancel_workflow_run is intentionally untouched here; callers asking for
  // stuck-run cancellation should compose it explicitly. Reference held to
  // keep the import wired for the type-checker.
  void cancelWorkflowRunOperation
  return { cancelled: [], deleted, skipped, summary }
}

function empty(): CleanSummary {
  return { oldRuns: [], expiredArtifacts: [], totalSizeBytes: 0 }
}
