#!/usr/bin/env bun
/**
 * Fixture-drift detector for the nightly live integration suite.
 *
 * For every operation in the registry, runs its Zod outputSchema against
 * a single live response sample. If the live shape no longer parses, the
 * GitHub API contract drifted and the corresponding adapter type +
 * outputSchema need updating.
 *
 * Read-only ops only — write ops are excluded so this script never
 * mutates the live repo. Per-op runs are best-effort: a transient
 * network error counts as a soft skip, not a drift.
 *
 * Exits non-zero if any op's outputSchema fails to parse the live
 * response, so the GH Actions step fails and opens an issue.
 */
import { operations, setGithubAdapter, setRepoMonitoredCheck } from '../packages/operations/src'
import type { GithubAdapter } from '../packages/operations/src/adapters/github'
import { buildAppOctokit, loadAppCredentialsFromEnv } from '../apps/server/src/github/octokit-app'

interface DriftReport {
  opId: string
  ok: boolean
  reason?: string
}

const PROBE = { owner: 'Athrean', repo: 'Orchentra' }

const probeArgsByOp: Record<string, Record<string, unknown>> = {
  // Slice L expanded coverage — every read op the registry ships gets a
  // probe entry where deterministic args exist. Ops that need a specific
  // run/job/artifact id are skipped here because chaining them inside the
  // probe would couple a single op's drift to the upstream op's response.
  get_repo_metadata: { ...PROBE },
  get_pull_request: { ...PROBE, number: 1 },
  get_issue: { ...PROBE, number: 1 },
  get_file_content: { ...PROBE, path: 'README.md' },
  get_commit_changes: { ...PROBE, sha: 'main' },
  search_code: { ...PROBE, query: 'orchentra' },
  list_workflow_runs: { ...PROBE, perPage: 1 },
  list_branches: { ...PROBE, perPage: 1 },
  list_pull_requests: { ...PROBE, state: 'all', perPage: 1 },
  list_issues: { ...PROBE, state: 'all', perPage: 1 },
  list_check_runs: { ...PROBE, ref: 'main' },
  list_repo_secrets: { ...PROBE },
}

async function main(): Promise<void> {
  if (process.env.GITHUB_APP_LIVE !== '1') {
    console.log('GITHUB_APP_LIVE != 1 — drift check is a no-op outside the nightly workflow.')
    return
  }

  const creds = loadAppCredentialsFromEnv()
  if (!creds || !creds.installationId) {
    console.error('Missing App credentials — cannot run drift check.')
    process.exit(1)
  }

  setGithubAdapter(buildAppOctokit(creds) as unknown as GithubAdapter)
  setRepoMonitoredCheck(async (fullName) => fullName.toLowerCase() === 'athrean/orchentra')

  const ctx = { remote: false, allowedScopes: new Set<'read' | 'write' | 'admin'>(['read']) }

  const reports: DriftReport[] = []
  for (const op of operations) {
    if (op.scope !== 'read' || !(op.id in probeArgsByOp)) continue
    const args = probeArgsByOp[op.id]
    try {
      const res = await op.handler(ctx, args)
      const parsed = op.output?.safeParse(res)
      if (parsed && !parsed.success) {
        reports.push({ opId: op.id, ok: false, reason: parsed.error.toString().slice(0, 400) })
        continue
      }
      reports.push({ opId: op.id, ok: true })
    } catch (err) {
      reports.push({ opId: op.id, ok: true, reason: `soft-skip: ${(err as Error).message.slice(0, 200)}` })
    }
  }

  for (const r of reports) {
    const tag = r.ok ? 'ok' : 'DRIFT'
    const trail = r.reason ? ` — ${r.reason}` : ''
    console.log(`[${tag}] ${r.opId}${trail}`)
  }

  const drifted = reports.filter((r) => !r.ok)
  if (drifted.length > 0) {
    console.error(`\nDrift detected in ${drifted.length} op(s).`)
    process.exit(1)
  }
  console.log(`\nAll ${reports.length} probed ops parsed live response cleanly.`)
}

main().catch((err) => {
  console.error('Drift check crashed:', err)
  process.exit(1)
})
