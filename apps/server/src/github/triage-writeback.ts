import { Octokit } from '@octokit/rest'
import { eq } from 'drizzle-orm'
import { db, incidents } from '../db/client'
import { config } from '../config'

const TRIAGE_CHECK_NAME = 'Orchentra Triage'
const TRIAGE_STATUS_CONTEXT = 'orchentra/triage'

interface IncidentWritebackRecord {
  id: string
  repo: string
  commit: string
  workflowName: string
  branch: string
  githubCheckRunId: number | null
  githubTriageCommentIds: unknown
  rootCause: string | null
  suggestedFix: string | null
  confidence: number | null
}

interface PullRequestSummary {
  number: number
}

interface TriageCommentIds {
  [prNumber: string]: number
}

const octokit = new Octokit({ auth: config.github.token })

function parseRepo(repo: string): { owner: string; name: string } | null {
  const [owner, name] = repo.split('/')
  if (!owner || !name) return null
  return { owner, name }
}

function getDashboardUrl(incident: IncidentWritebackRecord): string | null {
  const frontendUrl = process.env.FRONTEND_URL
  if (!frontendUrl) return null
  return `${frontendUrl}/dashboard/${encodeURIComponent(incident.repo)}?incident=${incident.id}`
}

function parseCommentIds(raw: unknown): TriageCommentIds {
  if (!raw || typeof raw !== 'object') return {}
  const entries = Object.entries(raw)
  const parsed: TriageCommentIds = {}
  for (const [prNumber, commentId] of entries) {
    if (typeof commentId === 'number') {
      parsed[prNumber] = commentId
    }
  }
  return parsed
}

async function persistGithubMetadata(
  incidentId: string,
  updates: { githubCheckRunId?: number; githubTriageCommentIds?: TriageCommentIds },
): Promise<void> {
  const updateValues: { githubCheckRunId?: number; githubTriageCommentIds?: TriageCommentIds } = {}
  if (typeof updates.githubCheckRunId === 'number') {
    updateValues.githubCheckRunId = updates.githubCheckRunId
  }
  if (updates.githubTriageCommentIds) {
    updateValues.githubTriageCommentIds = updates.githubTriageCommentIds
  }
  if (Object.keys(updateValues).length === 0) return

  await db.update(incidents).set(updateValues).where(eq(incidents.id, incidentId))
}

async function upsertCheckRun(
  incident: IncidentWritebackRecord,
  status: 'in_progress' | 'completed',
  conclusion?: 'success' | 'failure',
): Promise<number | null> {
  const parsedRepo = parseRepo(incident.repo)
  if (!parsedRepo) return null

  const detailsUrl = getDashboardUrl(incident) ?? undefined
  const summary =
    status === 'in_progress'
      ? `Investigating workflow failure for ${incident.workflowName}.`
      : conclusion === 'success'
        ? `Triage complete for ${incident.workflowName}.`
        : `Triage failed for ${incident.workflowName}.`

  const output = {
    title: TRIAGE_CHECK_NAME,
    summary,
    text:
      status === 'in_progress'
        ? 'The Orchentra agent is collecting logs and investigating root cause.'
        : conclusion === 'success'
          ? `Root cause: ${incident.rootCause ?? 'Unknown'}\n\nSuggested fix: ${incident.suggestedFix ?? 'No fix available.'}`
          : 'Orchentra could not complete triage. Check server logs for details.',
  }

  if (incident.githubCheckRunId) {
    await octokit.checks.update({
      owner: parsedRepo.owner,
      repo: parsedRepo.name,
      check_run_id: incident.githubCheckRunId,
      name: TRIAGE_CHECK_NAME,
      status,
      conclusion,
      details_url: detailsUrl,
      completed_at: status === 'completed' ? new Date().toISOString() : undefined,
      output,
    })
    return incident.githubCheckRunId
  }

  const { data } = await octokit.checks.create({
    owner: parsedRepo.owner,
    repo: parsedRepo.name,
    head_sha: incident.commit,
    name: TRIAGE_CHECK_NAME,
    status,
    conclusion,
    details_url: detailsUrl,
    completed_at: status === 'completed' ? new Date().toISOString() : undefined,
    output,
  })
  return data.id
}

async function createCommitStatus(
  incident: IncidentWritebackRecord,
  state: 'pending' | 'success' | 'error',
  description: string,
): Promise<void> {
  const parsedRepo = parseRepo(incident.repo)
  if (!parsedRepo) return

  await octokit.repos.createCommitStatus({
    owner: parsedRepo.owner,
    repo: parsedRepo.name,
    sha: incident.commit,
    state,
    context: TRIAGE_STATUS_CONTEXT,
    description: description.slice(0, 140),
    target_url: getDashboardUrl(incident) ?? undefined,
  })
}

async function listOpenPullRequestsForCommit(incident: IncidentWritebackRecord): Promise<PullRequestSummary[]> {
  const parsedRepo = parseRepo(incident.repo)
  if (!parsedRepo) return []

  const { data } = await octokit.repos.listPullRequestsAssociatedWithCommit({
    owner: parsedRepo.owner,
    repo: parsedRepo.name,
    commit_sha: incident.commit,
  })

  return data.filter((pr) => pr.state === 'open' && pr.number).map((pr) => ({ number: pr.number }))
}

function triageCommentMarker(incidentId: string): string {
  return `<!-- orchentra-triage:${incidentId} -->`
}

function buildTriageCommentBody(incident: IncidentWritebackRecord, status: 'brief_ready' | 'error'): string {
  const marker = triageCommentMarker(incident.id)
  const confidence = incident.confidence !== null ? `${Math.round(incident.confidence * 100)}%` : 'unknown'
  const dashboardUrl = getDashboardUrl(incident)

  if (status === 'error') {
    return [
      marker,
      '## Orchentra Triage Update',
      '',
      ':warning: Triage did not complete successfully for this workflow failure.',
      '',
      dashboardUrl ? `[View incident details](${dashboardUrl})` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    marker,
    '## Orchentra Triage Results',
    '',
    `**Root cause:** ${incident.rootCause ?? 'Unknown'}`,
    '',
    `**Suggested fix:** ${incident.suggestedFix ?? 'No fix suggested.'}`,
    '',
    `**Confidence:** ${confidence}`,
    '',
    dashboardUrl ? `[View incident details](${dashboardUrl})` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function upsertPullRequestComments(
  incident: IncidentWritebackRecord,
  status: 'brief_ready' | 'error',
): Promise<void> {
  const parsedRepo = parseRepo(incident.repo)
  if (!parsedRepo) return

  const pullRequests = await listOpenPullRequestsForCommit(incident)
  if (pullRequests.length === 0) return

  const existingIds = parseCommentIds(incident.githubTriageCommentIds)
  const nextIds: TriageCommentIds = { ...existingIds }
  const marker = triageCommentMarker(incident.id)
  const body = buildTriageCommentBody(incident, status)

  for (const pullRequest of pullRequests) {
    const prKey = String(pullRequest.number)
    const knownCommentId = existingIds[prKey]

    if (knownCommentId) {
      await octokit.issues.updateComment({
        owner: parsedRepo.owner,
        repo: parsedRepo.name,
        comment_id: knownCommentId,
        body,
      })
      continue
    }

    const { data: comments } = await octokit.issues.listComments({
      owner: parsedRepo.owner,
      repo: parsedRepo.name,
      issue_number: pullRequest.number,
      per_page: 100,
    })

    const existingComment = comments.find((comment) => (comment.body ?? '').includes(marker))
    if (existingComment) {
      await octokit.issues.updateComment({
        owner: parsedRepo.owner,
        repo: parsedRepo.name,
        comment_id: existingComment.id,
        body,
      })
      nextIds[prKey] = existingComment.id
      continue
    }

    const { data: createdComment } = await octokit.issues.createComment({
      owner: parsedRepo.owner,
      repo: parsedRepo.name,
      issue_number: pullRequest.number,
      body,
    })
    nextIds[prKey] = createdComment.id
  }

  if (Object.keys(nextIds).length !== Object.keys(existingIds).length) {
    await persistGithubMetadata(incident.id, { githubTriageCommentIds: nextIds })
  }
}

export async function publishInitialGithubTriage(incident: IncidentWritebackRecord): Promise<void> {
  try {
    const checkRunId = await upsertCheckRun(incident, 'in_progress')
    if (checkRunId) {
      await persistGithubMetadata(incident.id, { githubCheckRunId: checkRunId })
    }
  } catch (error) {
    console.error(`Failed to publish initial GitHub check for incident ${incident.id}:`, error)
  }

  try {
    await createCommitStatus(incident, 'pending', 'Orchentra is investigating this workflow failure')
  } catch (error) {
    console.error(`Failed to publish initial commit status for incident ${incident.id}:`, error)
  }
}

export async function publishFinalGithubTriage(
  incident: IncidentWritebackRecord,
  status: 'brief_ready' | 'error',
): Promise<void> {
  try {
    const checkRunId = await upsertCheckRun(incident, 'completed', status === 'brief_ready' ? 'success' : 'failure')
    if (checkRunId) {
      await persistGithubMetadata(incident.id, { githubCheckRunId: checkRunId })
    }
  } catch (error) {
    console.error(`Failed to publish final GitHub check for incident ${incident.id}:`, error)
  }

  try {
    await createCommitStatus(
      incident,
      status === 'brief_ready' ? 'success' : 'error',
      status === 'brief_ready' ? 'Orchentra triage complete' : 'Orchentra triage failed',
    )
  } catch (error) {
    console.error(`Failed to publish final commit status for incident ${incident.id}:`, error)
  }

  try {
    await upsertPullRequestComments(incident, status)
  } catch (error) {
    console.error(`Failed to publish triage PR comments for incident ${incident.id}:`, error)
  }
}
