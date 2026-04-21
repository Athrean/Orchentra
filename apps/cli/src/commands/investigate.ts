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

export interface InvestigateDeps {
  readonly cli: LiveCli
  readonly clientFactory?: (token: string) => GitHubClient
  readonly write?: (text: string) => void
  readonly now?: () => number
}

export interface InvestigationResult {
  readonly run: WorkflowRun
  readonly failingJobs: WorkflowJob[]
  readonly elapsedMs: number
}

export async function investigate(spec: RepoRunSpec, deps: InvestigateDeps): Promise<InvestigationResult> {
  assertOrgAllowed(spec.owner)

  const write = deps.write ?? ((text: string): void => void process.stdout.write(text))
  const now = deps.now ?? Date.now
  const started = now()

  const { token } = requireToken()
  const client = deps.clientFactory ? deps.clientFactory(token) : new GitHubClient({ token })

  write(`Fetching workflow run ${spec.owner}/${spec.repo}#${spec.runId}...\n`)
  const run = await getWorkflowRun(client, spec.owner, spec.repo, spec.runId)
  write(
    `  ${run.name ?? 'workflow'} on ${run.head_branch}@${run.head_sha.slice(0, 7)} — ${run.conclusion ?? run.status}\n`,
  )

  const jobs = await listWorkflowJobs(client, spec.owner, spec.repo, spec.runId)
  const failingJobs = jobs.filter(isFailingJob)

  if (failingJobs.length === 0) {
    write('No failing jobs on this run. Nothing to investigate.\n')
    return { run, failingJobs, elapsedMs: now() - started }
  }

  write(`Found ${failingJobs.length} failing job(s): ${failingJobs.map((j) => j.name).join(', ')}\n\n`)

  const logExcerpts = await Promise.all(
    failingJobs.map(async (job) => {
      const rawLogs = await getJobLogs(client, spec.owner, spec.repo, job.id)
      return { job, tail: tailFailingLog(rawLogs) }
    }),
  )

  const prompt = buildInvestigationPrompt(run, logExcerpts)
  await deps.cli.runTurn(prompt)

  return { run, failingJobs, elapsedMs: now() - started }
}

function buildInvestigationPrompt(run: WorkflowRun, excerpts: { job: WorkflowJob; tail: string }[]): string {
  const header = [
    `Workflow run: ${run.name ?? '(unnamed)'} (#${run.id})`,
    `Branch: ${run.head_branch}`,
    `Commit: ${run.head_sha}`,
    `Event: ${run.event}`,
    `Conclusion: ${run.conclusion ?? run.status}`,
    `URL: ${run.html_url}`,
  ].join('\n')

  const sections = excerpts.map(({ job, tail }) => {
    const failingSteps = job.steps.filter((s) => s.conclusion === 'failure').map((s) => s.name)
    return [
      `### Job: ${job.name} (#${job.id})`,
      `Failing step(s): ${failingSteps.join(', ') || '(unknown)'}`,
      `URL: ${job.html_url}`,
      '',
      '```log',
      tail,
      '```',
    ].join('\n')
  })

  return [
    'You are investigating a failed CI run. Produce a concise triage brief:',
    '1. Root cause hypothesis in one sentence',
    '2. Evidence lines from the logs that support it',
    '3. Recommended next step (file to edit, test to run, config to change)',
    '',
    header,
    '',
    sections.join('\n\n'),
  ].join('\n')
}
