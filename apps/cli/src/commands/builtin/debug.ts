import { PatternStore, failureSignature, looksLikeFailure, redactSecrets } from '@orchentra/cli-core'
import type { PatternEntry } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import type { UiCardSection } from '../ui-output'

export interface FailedRun {
  repo: string
  runId: number
  runUrl: string
  branch: string
  workflowName: string
  jobName: string
  /** Failing job log (raw). */
  log: string
}

export interface DebugDeps {
  /** Find the most recent failed workflow run for the workspace, or null. */
  findLatestFailure: (cwd: string) => Promise<FailedRun | null>
  /** Load stored failure memories for the org. */
  loadMemories: (orgId: string) => PatternEntry[]
}

const ORG_ID = 'default'

function errorExcerpt(log: string, max = 6): string {
  const lines = redactSecrets(log)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const hits = lines.filter(looksLikeFailure)
  return (hits.length > 0 ? hits : lines).slice(0, max).join('\n')
}

export class DebugCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'debug',
    aliases: [],
    summary: 'Diagnose the latest failed deploy/CI run against past fixes',
    argumentHint: '',
  }

  constructor(private readonly deps: DebugDeps = defaultDeps()) {}

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    const run = await this.deps.findLatestFailure(ctx.cwd)
    if (!run) {
      return note(ctx, 'No failed workflow run found for this repo. Nothing to debug right now.')
    }

    const signature = failureSignature({ workflowName: run.workflowName, jobName: run.jobName, log: run.log })
    const matches = this.deps.loadMemories(ORG_ID).filter((e) => e.incidentId === signature.hash)
    const excerpt = errorExcerpt(run.log)

    const sections: UiCardSection[] = [
      {
        title: 'Failure',
        rows: [
          { key: 'repo', value: run.repo },
          { key: 'workflow', value: run.workflowName },
          { key: 'job', value: run.jobName },
          { key: 'branch', value: run.branch },
          { key: 'run', value: run.runUrl },
          { key: 'signature', value: signature.hash },
        ],
      },
      { title: 'Likely cause', rows: [{ key: '', value: excerpt }] },
    ]

    if (matches.length > 0) {
      const m = matches[0]
      sections.push({
        title: 'Seen before — past fix',
        rows: [
          { key: 'memory', value: m.id.slice(0, 8) },
          { key: 'resolution', value: m.resolution },
        ],
      })
    } else {
      sections.push({
        title: 'Memory',
        rows: [{ key: '', value: 'No matching memory yet — this failure will be recorded once you resolve it.' }],
      })
    }

    sections.push({
      title: 'Next',
      rows: [
        {
          key: '',
          value:
            matches.length > 0
              ? 'Apply the prior fix above, or ask me to implement it. No changes were made.'
              : 'Ask me to investigate and propose a fix. Writes stay gated by your permission mode.',
        },
      ],
    })

    if (ctx.ui) {
      ctx.ui({ kind: 'card', title: 'Debug', subtitle: `${run.workflowName} · ${run.jobName}`, sections })
      return true
    }
    const lines = [`Debug — ${run.repo} ${run.workflowName}/${run.jobName}`]
    for (const s of sections) {
      lines.push('', s.title ?? '')
      for (const r of s.rows) lines.push(r.key ? `  ${r.key}: ${r.value}` : `  ${r.value}`)
    }
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }
}

function note(ctx: CommandContext, text: string): boolean {
  if (ctx.ui) ctx.ui({ kind: 'note', text })
  else process.stdout.write(text + '\n')
  return true
}

function defaultDeps(): DebugDeps {
  return {
    findLatestFailure: ghFindLatestFailure,
    loadMemories: (orgId) => new PatternStore().load(orgId),
  }
}

// Uses the already-authenticated `gh` CLI, which infers the repo from cwd. Any
// failure (no gh, no repo, no failed runs) degrades to null — /debug then shows
// its no-data state rather than throwing.
async function ghFindLatestFailure(cwd: string): Promise<FailedRun | null> {
  try {
    const list = Bun.spawnSync(
      ['gh', 'run', 'list', '--status', 'failure', '--limit', '1', '--json', 'databaseId,workflowName,headBranch,url'],
      { cwd, stdout: 'pipe', stderr: 'pipe' },
    )
    if (list.exitCode !== 0) return null
    const runs = JSON.parse(list.stdout.toString()) as Array<{
      databaseId: number
      workflowName: string
      headBranch: string
      url: string
    }>
    const run = runs[0]
    if (!run) return null

    const repoProc = Bun.spawnSync(['gh', 'repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const repo = repoProc.exitCode === 0 ? repoProc.stdout.toString().trim() : 'unknown'

    const logProc = Bun.spawnSync(['gh', 'run', 'view', String(run.databaseId), '--log-failed'], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const log = logProc.stdout.toString()
    const jobName = firstFailedJobName(log)

    return {
      repo,
      runId: run.databaseId,
      runUrl: run.url,
      branch: run.headBranch,
      workflowName: run.workflowName,
      jobName,
      log,
    }
  } catch {
    return null
  }
}

// `gh run view --log-failed` prefixes each line with "<job>\t<step>\t...".
function firstFailedJobName(log: string): string {
  const first = log.split('\n').find((l) => l.includes('\t'))
  return first ? first.split('\t')[0].trim() : 'unknown'
}
