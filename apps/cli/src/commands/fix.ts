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
import { buildTriageBrief, shortSummary, type JobLogBundle, type TriageBrief } from './brief'
import { defaultFixTitle, fixBranchName, idempotencyKey, renderFixBody } from './fix-branch'
import type { GhPrOps, GhPrViewResult } from './gh-pr-ops'
import { ShellGhPrOps } from './gh-pr-ops'
import type { GitOps } from './git-ops'
import type { RepoRunSpec } from './spec'

export interface FixDeps {
  readonly cli: LiveCli
  readonly git: GitOps
  readonly clientFactory?: (token: string) => GitHubClient
  readonly write?: (text: string) => void
  /**
   * Diff preview gate. Receives the patch text and must return true to
   * proceed with commit + push + PR. Defaults to an interactive y/N prompt;
   * tests inject a deterministic implementation.
   */
  readonly confirmDiff?: (diff: string) => Promise<boolean>
  /** PR I/O over `gh` CLI. Defaults to `ShellGhPrOps` invoking the real `gh` binary. */
  readonly gh?: GhPrOps
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
  readonly pullRequest: GhPrViewResult | null
  readonly createdPullRequest: boolean
  readonly changedFiles: boolean
  /** True when the user (or test harness) approved the diff preview. */
  readonly userConfirmed: boolean
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
    return { ...emptyResult(run, failingJobs, base), brief, branch, changedFiles: false, userConfirmed: false }
  }

  const diff = deps.git.diffFiles(agentChangedFiles)
  const confirm = deps.confirmDiff ?? defaultConfirmDiff(write)
  const approved = await confirm(diff)
  if (!approved) {
    write('Patch rejected by user; not opening a PR.\n')
    return {
      ...emptyResult(run, failingJobs, base),
      brief,
      branch,
      changedFiles: true,
      userConfirmed: false,
    }
  }

  deps.git.add(agentChangedFiles)
  deps.git.commit(`${title}\n\nOrchentra fix for ${spec.owner}/${spec.repo}#${spec.runId}`)
  write(`Pushing ${branch}...\n`)
  deps.git.push(branch)

  const gh = deps.gh ?? new ShellGhPrOps()
  const existing = await gh.findOpenByHead(spec.owner, spec.repo, branch)
  const key = idempotencyKey(branch, base, title)
  const body = renderFixBody({
    runUrl: run.html_url,
    runId: run.id,
    idempotencyKey: key,
    bug: shortSummary(brief),
    fix: `Patched ${agentChangedFiles.length} file${agentChangedFiles.length === 1 ? '' : 's'} on \`${branch}\`.`,
    reasoning: 'Minimum delta to make the failing checks pass; no refactors or unrelated cleanup.',
  })

  let pullRequest: GhPrViewResult
  let createdPullRequest = false
  if (existing) {
    write(`Updating existing PR #${existing.number}...\n`)
    pullRequest = await gh.update({ owner: spec.owner, repo: spec.repo, number: existing.number, title, body })
  } else {
    write('Creating new PR via gh CLI...\n')
    pullRequest = await gh.create({ owner: spec.owner, repo: spec.repo, head: branch, base, title, body })
    createdPullRequest = true
  }

  return {
    run,
    failingJobs,
    brief,
    branch,
    pullRequest,
    createdPullRequest,
    changedFiles: true,
    userConfirmed: true,
  }
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
    userConfirmed: false,
  }
}

function defaultConfirmDiff(write: (text: string) => void): (diff: string) => Promise<boolean> {
  return async (diff: string): Promise<boolean> => {
    write('\n--- Proposed patch ---\n')
    write(diff || '(empty diff)\n')
    write('--- End patch ---\n')

    if (!process.stdin.isTTY) {
      write('No TTY available to confirm; refusing to open PR. Re-run interactively to approve.\n')
      return false
    }

    write('Open PR with this patch? (y/N) > ')
    return await readLineYesNo()
  }
}

function readLineYesNo(): Promise<boolean> {
  return new Promise((resolve) => {
    let buf = ''
    const onData = (chunk: Buffer): void => {
      buf += chunk.toString('utf8')
      const nl = buf.indexOf('\n')
      if (nl === -1) return
      const line = buf.slice(0, nl).trim().toLowerCase()
      process.stdin.off('data', onData)
      resolve(line === 'y' || line === 'yes')
    }
    process.stdin.on('data', onData)
  })
}

export function buildFixPrompt(run: WorkflowRun, brief: TriageBrief): string {
  return [
    `You are fixing a CI failure. Produce the MINIMUM code delta that resolves the failing jobs.`,
    '',
    `Hard constraints — the patch MUST satisfy all of these:`,
    `- Do not rename symbols, files, variables, or functions.`,
    `- Do not reorder imports, declarations, or members.`,
    `- Do not add type hints, annotations, or generics that the failing job does not require.`,
    `- Do not refactor working code adjacent to the bug.`,
    `- Do not improve, restructure, or "clean up" code that is not the direct cause of the failure.`,
    `- Do not add comments, docstrings, or formatting changes.`,
    `- Do not introduce abstractions, helpers, or "future flexibility" indirection.`,
    `- Do not edit lockfiles, build artifacts, generated files, or unrelated tests.`,
    '',
    `Every changed line must trace directly to the failing job's root cause. If a line is not strictly necessary to make the failing job pass, do not change it.`,
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
