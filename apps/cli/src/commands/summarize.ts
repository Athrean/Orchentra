import {
  GitHubClient,
  getJobLogs,
  getWorkflowRun,
  isFailingJob,
  listWorkflowJobs,
  requireToken,
  type WorkflowJob,
  type WorkflowRun,
} from '@orchentra/cli-api'
import type { LiveCli } from '../live-cli'
import { assertOrgAllowed } from './org-guard'
import { tailFailingLog } from './log-tail'
import type { RepoRunSpec } from './spec'

export interface SummarizeDeps {
  readonly cli: LiveCli
  readonly clientFactory?: (token: string) => GitHubClient
  readonly write?: (text: string) => void
  readonly now?: () => number
}

export interface SummarizeResult {
  readonly run: WorkflowRun
  readonly failingJobs: WorkflowJob[]
  readonly elapsedMs: number
}

export interface JobLogExcerpt {
  readonly job: WorkflowJob
  readonly tail: string
}

export async function summarize(spec: RepoRunSpec, deps: SummarizeDeps): Promise<SummarizeResult> {
  assertOrgAllowed(spec.owner)

  const write = deps.write ?? ((text: string): void => void process.stdout.write(text))
  const now = deps.now ?? Date.now
  const started = now()

  const { token } = requireToken()
  const client = deps.clientFactory ? deps.clientFactory(token) : new GitHubClient({ token })

  write(`Fetching run ${spec.owner}/${spec.repo}#${spec.runId}...\n`)
  const run = await getWorkflowRun(client, spec.owner, spec.repo, spec.runId)
  const jobs = await listWorkflowJobs(client, spec.owner, spec.repo, spec.runId)
  const failingJobs = jobs.filter(isFailingJob)

  if (failingJobs.length === 0) {
    write('No failing jobs on this run. Nothing to summarize.\n')
    return { run, failingJobs, elapsedMs: now() - started }
  }

  const excerpts: JobLogExcerpt[] = await Promise.all(
    failingJobs.map(async (job) => ({
      job,
      tail: tailFailingLog(await getJobLogs(client, spec.owner, spec.repo, job.id)),
    })),
  )

  await deps.cli.runTurn(buildSummarizePrompt(run, excerpts))
  return { run, failingJobs, elapsedMs: now() - started }
}

// Senior-engineer debugging note. Three sections, no padding, no preamble.
// Locked format: Root cause / Where / Recommended fix. The prompt is kept
// tight on purpose — any added prose dilutes the three-line discipline.
export function buildSummarizePrompt(run: WorkflowRun, excerpts: JobLogExcerpt[]): string {
  const header = [
    `Run: ${run.name ?? '(unnamed)'} #${run.id} on ${run.head_branch}@${run.head_sha.slice(0, 7)} — ${run.conclusion ?? run.status}`,
  ].join('\n')

  const sections = excerpts.map(({ job, tail }) => {
    const failing =
      job.steps
        .filter((s) => s.conclusion === 'failure')
        .map((s) => s.name)
        .join(', ') || '(unknown)'
    return [`### ${job.name} — failing step(s): ${failing}`, '```log', tail, '```'].join('\n')
  })

  return [
    'You are a senior engineer leaving a debugging note for a teammate.',
    'Output EXACTLY three sections in this order. No preamble. No fourth section. No closing remarks. No "Hope this helps".',
    '',
    '**Root cause** — 1–2 sentences.',
    '**Where** — file:line or job/step reference.',
    '**Recommended fix** — concrete, code-level. Not "investigate further".',
    '',
    header,
    '',
    sections.join('\n\n'),
  ].join('\n')
}
