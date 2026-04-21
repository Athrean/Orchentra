import {
  GitHubClient,
  createPullRequest,
  findOpenPullByHead,
  getJobLogs,
  getWorkflowRun,
  isFailingJob,
  listWorkflowJobs,
  requireToken,
  updatePullRequest,
  type PullRequestRef,
  type WorkflowJob,
  type WorkflowRun,
} from '@orchentra/cli-api'
import type { LiveCli } from '../live-cli'
import { assertOrgAllowed } from './org-guard'
import { buildTriageBrief, type JobLogBundle, type TriageBrief } from './brief'
import { defaultFixTitle, fixBranchName, idempotencyKey, renderFixBody } from './fix-branch'
import type { GitOps } from './git-ops'
import type { RepoRunSpec } from './spec'

export interface FixDeps {
  readonly cli: LiveCli
  readonly git: GitOps
  readonly clientFactory?: (token: string) => GitHubClient
  readonly write?: (text: string) => void
}

export interface FixOptions {
  readonly base?: string
  readonly title?: string
}

export interface FixResult {
  readonly run: WorkflowRun
  readonly failingJobs: WorkflowJob[]
  readonly brief: TriageBrief
  readonly branch: string
  readonly pullRequest: PullRequestRef | null
  readonly createdPullRequest: boolean
  readonly changedFiles: boolean
}

export async function fix(spec: RepoRunSpec, options: FixOptions, deps: FixDeps): Promise<FixResult> {
  assertOrgAllowed(spec.owner)
  const write = deps.write ?? ((text: string): void => void process.stdout.write(text))

  const { token } = requireToken()
  const client = deps.clientFactory ? deps.clientFactory(token) : new GitHubClient({ token })

  write(`Fetching run ${spec.owner}/${spec.repo}#${spec.runId}...\n`)
  const run = await getWorkflowRun(client, spec.owner, spec.repo, spec.runId)
  const jobs = await listWorkflowJobs(client, spec.owner, spec.repo, spec.runId)
  const failingJobs = jobs.filter(isFailingJob)

  if (failingJobs.length === 0) {
    write('No failing jobs on this run. Nothing to fix.\n')
    return emptyResult(run, failingJobs, options.base)
  }

  const bundles: JobLogBundle[] = await Promise.all(
    failingJobs.map(async (job) => ({ job, logs: await getJobLogs(client, spec.owner, spec.repo, job.id) })),
  )
  const brief = buildTriageBrief(run, bundles)

  const base = options.base ?? 'main'
  const branch = fixBranchName({ runId: spec.runId })
  const title = options.title ?? defaultFixTitle(run.name, run.id)

  write(`Preparing branch ${branch} from ${base}...\n`)
  deps.git.checkout(branch, base)
  const filesBefore = new Set(deps.git.listUncommittedFiles())

  write('Running agent to produce a fix...\n')
  await deps.cli.runTurn(buildFixPrompt(run, brief))

  const filesAfter = deps.git.listUncommittedFiles()
  const agentChangedFiles = filesAfter.filter((path) => !filesBefore.has(path))
  if (agentChangedFiles.length === 0) {
    write('Agent produced no file changes; not opening a PR.\n')
    return { ...emptyResult(run, failingJobs, base), brief, branch, changedFiles: false }
  }

  deps.git.add(agentChangedFiles)
  deps.git.commit(`${title}\n\nOrchentra fix for ${spec.owner}/${spec.repo}#${spec.runId}`)
  write(`Pushing ${branch}...\n`)
  deps.git.push(branch)

  const existing = await findOpenPullByHead(client, spec.owner, spec.repo, branch)
  const key = idempotencyKey(branch, base, title)
  const body = renderFixBody({ runUrl: run.html_url, runId: run.id, idempotencyKey: key, summary: brief.summary })

  let pullRequest: PullRequestRef
  let createdPullRequest = false
  if (existing) {
    write(`Updating existing PR #${existing.number}...\n`)
    pullRequest = await updatePullRequest(client, spec.owner, spec.repo, existing.number, { title, body })
  } else {
    write('Creating new PR...\n')
    pullRequest = await createPullRequest(client, spec.owner, spec.repo, { title, head: branch, base, body })
    createdPullRequest = true
  }

  return { run, failingJobs, brief, branch, pullRequest, createdPullRequest, changedFiles: true }
}

function emptyResult(run: WorkflowRun, jobs: WorkflowJob[], base = 'main'): FixResult {
  return {
    run,
    failingJobs: jobs,
    brief: buildTriageBrief(run, []),
    branch: fixBranchName({ runId: run.id, base }),
    pullRequest: null,
    createdPullRequest: false,
    changedFiles: false,
  }
}

function buildFixPrompt(run: WorkflowRun, brief: TriageBrief): string {
  return [
    `You are fixing a CI failure. Produce a minimal code change that resolves the failing jobs.`,
    `Do not edit lockfiles or generated artifacts. Use the edit tools to modify files.`,
    '',
    `Workflow: ${run.name ?? '(unnamed)'}`,
    `Commit: ${run.head_sha}`,
    `Failures:`,
    brief.summary,
    '',
    brief.details,
    '',
    `When done, stop. Do not create commits yourself — the harness handles git.`,
  ].join('\n')
}
