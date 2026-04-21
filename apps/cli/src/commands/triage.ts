import {
  GitHubClient,
  createCommitStatus,
  getJobLogs,
  getWorkflowRun,
  isFailingJob,
  listPullsForCommit,
  listWorkflowJobs,
  requireToken,
  upsertCheckRun,
  upsertMarkedComment,
  type CheckRun,
  type CommitStatus,
  type IssueComment,
  type PullRequestRef,
  type WorkflowJob,
  type WorkflowRun,
} from '@orchentra/cli-api'
import { assertOrgAllowed } from './org-guard'
import { buildTriageBrief, shortSummary, type JobLogBundle, type TriageBrief } from './brief'
import type { RepoRunSpec } from './spec'

export interface TriageDeps {
  readonly clientFactory?: (token: string) => GitHubClient
  readonly write?: (text: string) => void
}

export interface TriageResult {
  readonly run: WorkflowRun
  readonly failingJobs: WorkflowJob[]
  readonly brief: TriageBrief
  readonly status: CommitStatus
  readonly check: CheckRun
  readonly comment: IssueComment | null
  readonly pullRequest: PullRequestRef | null
}

const TRIAGE_CONTEXT = 'orchentra/triage'
const TRIAGE_CHECK_NAME = 'Orchentra Triage'

export async function triage(spec: RepoRunSpec, deps: TriageDeps = {}): Promise<TriageResult> {
  assertOrgAllowed(spec.owner)
  const write = deps.write ?? ((text: string): void => void process.stdout.write(text))

  const { token } = requireToken()
  const client = deps.clientFactory ? deps.clientFactory(token) : new GitHubClient({ token })

  write(`Fetching run ${spec.owner}/${spec.repo}#${spec.runId}...\n`)
  const run = await getWorkflowRun(client, spec.owner, spec.repo, spec.runId)
  const jobs = await listWorkflowJobs(client, spec.owner, spec.repo, spec.runId)
  const failingJobs = jobs.filter(isFailingJob)

  const bundles: JobLogBundle[] = await Promise.all(
    failingJobs.map(async (job) => ({ job, logs: await getJobLogs(client, spec.owner, spec.repo, job.id) })),
  )

  const brief = buildTriageBrief(run, bundles)
  const pullRequest = await findPullForSha(client, spec.owner, spec.repo, run.head_sha)

  const state = brief.conclusion === 'failure' ? 'failure' : 'success'
  write(`Posting commit status (${state}) for ${run.head_sha.slice(0, 7)}...\n`)
  const status = await createCommitStatus(client, spec.owner, spec.repo, {
    sha: run.head_sha,
    state,
    context: TRIAGE_CONTEXT,
    description: shortSummary(brief),
    targetUrl: run.html_url,
  })

  write(`Upserting check run...\n`)
  const check = await upsertCheckRun(client, spec.owner, spec.repo, {
    name: TRIAGE_CHECK_NAME,
    headSha: run.head_sha,
    status: 'completed',
    conclusion: brief.conclusion,
    externalId: `orchentra-triage-${run.id}`,
    detailsUrl: run.html_url,
    output: {
      title: brief.title,
      summary: brief.summary,
      text: brief.details,
    },
  })

  let comment: IssueComment | null = null
  if (pullRequest) {
    write(`Upserting PR comment on #${pullRequest.number}...\n`)
    comment = await upsertMarkedComment(
      client,
      spec.owner,
      spec.repo,
      pullRequest.number,
      `run-${run.id}`,
      renderPrComment(brief, run),
    )
  }

  return { run, failingJobs, brief, status, check, comment, pullRequest }
}

async function findPullForSha(
  client: GitHubClient,
  owner: string,
  repo: string,
  sha: string,
): Promise<PullRequestRef | null> {
  const pulls = await listPullsForCommit(client, owner, repo, sha)
  return pulls.find((p) => p.state === 'open') ?? pulls[0] ?? null
}

function renderPrComment(brief: TriageBrief, run: WorkflowRun): string {
  return [`**Orchentra triage — ${brief.title}**`, '', brief.summary, '', `Run: ${run.html_url}`].join('\n')
}
