import { eq } from 'drizzle-orm'
import { Octokit } from '@octokit/rest'
import { config } from '../config'
import { db, incidents, incidentActions } from '../db/client'
import { incidentEvents } from '../events'
import { postThreadReply, updateSlackToFixing, updateSlackToResolved } from '../slack/message'
import { saveResolvedPattern } from '../agent/patterns'
import { findIncidentByPrUrl, findFixingIncidentForRepoBranch } from '../queries/incidents'
import type { IncidentBrief } from '@orchentra/core'

const octokit = new Octokit({ auth: config.github.token })

export interface ActionResult {
  success: boolean
  error?: string
  httpStatus?: number
  data?: Record<string, unknown>
}

function parseRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split('/')
  return { owner, name }
}

function parseBrief(briefJson: string | null): IncidentBrief | null {
  if (!briefJson) return null
  try {
    return JSON.parse(briefJson) as IncidentBrief
  } catch {
    return null
  }
}

async function recordAction(
  incidentId: string,
  actionType: string,
  performedBy: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(incidentActions).values({
    id: crypto.randomUUID(),
    incidentId,
    actionType,
    performedBy,
    metadata: metadata ?? null,
  })
}

// ──────────────────────────────────────────────
// 1. Re-run failed workflow
// ──────────────────────────────────────────────

export async function rerunWorkflow(incidentId: string, performedBy: string | null): Promise<ActionResult> {
  const incident = await db.query.incidents.findFirst({ where: eq(incidents.id, incidentId) })
  if (!incident) return { success: false, error: 'Incident not found', httpStatus: 404 }

  if (!incident.workflowRunId) {
    return { success: false, error: 'No workflow run ID associated with this incident' }
  }

  if (incident.status !== 'brief_ready' && incident.status !== 'error') {
    return { success: false, error: `Cannot re-run workflow in status: ${incident.status}` }
  }

  const { owner, name } = parseRepo(incident.repo)

  try {
    await octokit.actions.reRunWorkflowFailedJobs({
      owner,
      repo: name,
      run_id: incident.workflowRunId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `GitHub API error: ${message}` }
  }

  const runUrl = `https://github.com/${incident.repo}/actions/runs/${incident.workflowRunId}`

  await db.update(incidents).set({ status: 'fixing' }).where(eq(incidents.id, incidentId))
  await recordAction(incidentId, 'rerun', performedBy, { runUrl })
  await postThreadReply(incidentId, `Workflow re-run triggered${performedBy ? ` by user` : ''}`)

  const brief = parseBrief(incident.briefJson)
  if (brief) {
    await updateSlackToFixing(incidentId, brief, 'Workflow re-run started', performedBy)
  }

  incidentEvents.emitIncidentEvent({
    type: 'incident:status_changed',
    incidentId,
    orgId: incident.orgId,
    repo: incident.repo,
    data: { status: 'fixing', action: 'rerun' },
  })

  return { success: true, data: { runUrl } }
}

// ──────────────────────────────────────────────
// 2. Create GitHub issue
// ──────────────────────────────────────────────

export async function createGithubIssue(incidentId: string, performedBy: string | null): Promise<ActionResult> {
  const incident = await db.query.incidents.findFirst({ where: eq(incidents.id, incidentId) })
  if (!incident) return { success: false, error: 'Incident not found', httpStatus: 404 }

  if (incident.githubIssueUrl) {
    return { success: true, data: { issueUrl: incident.githubIssueUrl, alreadyExists: true } }
  }

  if (!incident.briefJson) {
    return { success: false, error: 'No brief available — investigation must complete first' }
  }

  let brief: { rootCause?: string; summary?: string; suggestedFix?: string; confidence?: number }
  try {
    brief = JSON.parse(incident.briefJson)
  } catch {
    return { success: false, error: 'Failed to parse incident brief' }
  }

  const { owner, name } = parseRepo(incident.repo)
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const dashboardLink = `${frontendUrl}/dashboard/${encodeURIComponent(incident.repo)}?incident=${incidentId}`

  const confidencePct = Math.round((brief.confidence ?? 0) * 100)

  const body = [
    `## CI Failure Report`,
    '',
    `**Workflow:** ${incident.workflowName}`,
    `**Branch:** \`${incident.branch}\``,
    `**Commit:** \`${incident.commit.slice(0, 7)}\``,
    `**Confidence:** ${confidencePct}%`,
    '',
    `### Summary`,
    brief.summary ?? 'No summary available.',
    '',
    `### Root Cause`,
    brief.rootCause ?? 'Unknown.',
    '',
    `### Suggested Fix`,
    brief.suggestedFix ?? 'No fix suggested.',
    '',
    `---`,
    `*Created by [Orchentra](${dashboardLink}) — AI-powered CI/CD incident triage*`,
  ].join('\n')

  try {
    const { data: issue } = await octokit.issues.create({
      owner,
      repo: name,
      title: `[CI Failure] ${incident.workflowName} — ${(brief.rootCause ?? 'Unknown').slice(0, 80)}`,
      body,
      labels: ['ci-failure'],
    })

    const issueUrl = issue.html_url

    await db.update(incidents).set({ githubIssueUrl: issueUrl }).where(eq(incidents.id, incidentId))
    await recordAction(incidentId, 'create_issue', performedBy, { issueUrl, issueNumber: issue.number })
    await postThreadReply(incidentId, `GitHub issue created: #${issue.number}`)

    incidentEvents.emitIncidentEvent({
      type: 'incident:updated',
      incidentId,
      orgId: incident.orgId,
      repo: incident.repo,
      data: { issueUrl, issueNumber: issue.number },
    })

    return { success: true, data: { issueUrl, issueNumber: issue.number } }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `GitHub API error: ${message}` }
  }
}

// ──────────────────────────────────────────────
// 3. Create PR with suggested fix
// ──────────────────────────────────────────────

export async function createFixPR(incidentId: string, performedBy: string | null): Promise<ActionResult> {
  const incident = await db.query.incidents.findFirst({ where: eq(incidents.id, incidentId) })
  if (!incident) return { success: false, error: 'Incident not found', httpStatus: 404 }

  if (incident.githubPrUrl) {
    return { success: true, data: { prUrl: incident.githubPrUrl, alreadyExists: true } }
  }

  if (!incident.suggestedFix) {
    return { success: false, error: 'No suggested fix available for this incident' }
  }

  if (!incident.briefJson) {
    return { success: false, error: 'No brief available — investigation must complete first' }
  }

  let brief: { rootCause?: string; summary?: string }
  try {
    brief = JSON.parse(incident.briefJson)
  } catch {
    return { success: false, error: 'Failed to parse incident brief' }
  }

  const { owner, name } = parseRepo(incident.repo)
  const branchName = `fix/orchentra-${incidentId.slice(0, 8)}`
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const dashboardLink = `${frontendUrl}/dashboard/${encodeURIComponent(incident.repo)}?incident=${incidentId}`

  try {
    // Get the base branch ref
    const { data: ref } = await octokit.git.getRef({
      owner,
      repo: name,
      ref: `heads/${incident.branch}`,
    })

    // Create the fix branch
    await octokit.git.createRef({
      owner,
      repo: name,
      ref: `refs/heads/${branchName}`,
      sha: ref.object.sha,
    })

    // Create a commit with the suggested fix as the commit message body
    // The fix content goes in a new file or as a patch description
    const commitMessage = [
      `fix: ${(brief.rootCause ?? 'CI failure fix').slice(0, 72)}`,
      '',
      `Suggested fix from Orchentra AI triage:`,
      '',
      incident.suggestedFix,
      '',
      `Incident: ${dashboardLink}`,
    ].join('\n')

    // Get the tree for the commit
    const { data: commit } = await octokit.git.getCommit({
      owner,
      repo: name,
      commit_sha: ref.object.sha,
    })

    // Create empty commit with fix description (user will apply the actual code changes)
    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo: name,
      message: commitMessage,
      tree: commit.tree.sha,
      parents: [ref.object.sha],
    })

    await octokit.git.updateRef({
      owner,
      repo: name,
      ref: `heads/${branchName}`,
      sha: newCommit.sha,
    })

    // Open the PR
    const { data: pr } = await octokit.pulls.create({
      owner,
      repo: name,
      title: `fix: ${(brief.rootCause ?? 'CI failure').slice(0, 72)}`,
      body: [
        `## AI-Generated Fix`,
        '',
        `> **Warning:** This fix was generated by Orchentra AI. Please review carefully before merging.`,
        '',
        `### Root Cause`,
        brief.rootCause ?? 'Unknown',
        '',
        `### Suggested Fix`,
        incident.suggestedFix,
        '',
        `---`,
        `*Created by [Orchentra](${dashboardLink})*`,
      ].join('\n'),
      head: branchName,
      base: incident.branch,
    })

    const prUrl = pr.html_url

    await db.update(incidents).set({ githubPrUrl: prUrl, status: 'fixing' }).where(eq(incidents.id, incidentId))
    await recordAction(incidentId, 'create_pr', performedBy, { prUrl, prNumber: pr.number })
    await postThreadReply(incidentId, `Fix PR created: #${pr.number}`)

    const parsedBrief = parseBrief(incident.briefJson)
    if (parsedBrief) {
      await updateSlackToFixing(incidentId, parsedBrief, `PR #${pr.number} created`, performedBy)
    }

    incidentEvents.emitIncidentEvent({
      type: 'incident:status_changed',
      incidentId,
      orgId: incident.orgId,
      repo: incident.repo,
      data: { status: 'fixing', prUrl, prNumber: pr.number },
    })

    return { success: true, data: { prUrl, prNumber: pr.number } }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `GitHub API error: ${message}` }
  }
}

// ──────────────────────────────────────────────
// 4. Update status (dismiss / snooze / resolve)
// ──────────────────────────────────────────────

const ALLOWED_STATUS_UPDATES = new Set(['resolved', 'snoozed', 'dismissed'])

export async function updateIncidentStatus(
  incidentId: string,
  status: string,
  performedBy: string | null,
  snoozedUntil?: Date,
): Promise<ActionResult> {
  if (!ALLOWED_STATUS_UPDATES.has(status)) {
    return { success: false, error: `Invalid status: ${status}. Use dedicated handlers for escalate.` }
  }

  const incident = await db.query.incidents.findFirst({ where: eq(incidents.id, incidentId) })
  if (!incident) return { success: false, error: 'Incident not found', httpStatus: 404 }

  const updates: Record<string, unknown> = { status }

  if (status === 'resolved') {
    updates.resolvedAt = new Date()
    if (incident.triggeredAt) {
      updates.mttrSeconds = Math.round((Date.now() - new Date(incident.triggeredAt).getTime()) / 1000)
    }
  }

  if (status === 'snoozed' && snoozedUntil) {
    updates.snoozedUntil = snoozedUntil
  }

  await db.update(incidents).set(updates).where(eq(incidents.id, incidentId))
  await recordAction(incidentId, status === 'snoozed' ? 'snooze' : status, performedBy, {
    snoozedUntil: snoozedUntil?.toISOString(),
  })

  const actionLabel =
    status === 'dismissed'
      ? 'Incident dismissed'
      : status === 'snoozed'
        ? `Incident snoozed until ${snoozedUntil?.toISOString()}`
        : status === 'resolved'
          ? 'Incident resolved'
          : `Status changed to ${status}`

  await postThreadReply(incidentId, actionLabel)

  if (status === 'resolved') {
    const mttr = typeof updates.mttrSeconds === 'number' ? updates.mttrSeconds : null
    await updateSlackToResolved(incidentId, 'Manually resolved', mttr)
    saveResolvedPattern(incidentId).catch((err) =>
      console.error(`Failed to save resolved pattern for ${incidentId}:`, err),
    )
  }

  incidentEvents.emitIncidentEvent({
    type: 'incident:status_changed',
    incidentId,
    orgId: incident.orgId,
    repo: incident.repo,
    data: { status },
  })

  return { success: true, data: { status } }
}

// ──────────────────────────────────────────────
// 5. Escalate
// ──────────────────────────────────────────────

export async function escalateIncident(incidentId: string, performedBy: string | null): Promise<ActionResult> {
  const incident = await db.query.incidents.findFirst({ where: eq(incidents.id, incidentId) })
  if (!incident) return { success: false, error: 'Incident not found', httpStatus: 404 }

  if (incident.status === 'escalated') {
    return { success: false, error: 'Incident is already escalated' }
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const dashboardLink = `${frontendUrl}/dashboard/${encodeURIComponent(incident.repo)}?incident=${incidentId}`

  // Post escalation message to Slack
  const { slack } = await import('../slack/client')
  try {
    await slack.chat.postMessage({
      channel: config.delivery.slack.channel,
      text: [
        `:rotating_light: *ESCALATED* — ${incident.repo}`,
        `*Workflow:* ${incident.workflowName} on \`${incident.branch}\``,
        incident.rootCause ? `*Root cause:* ${incident.rootCause}` : '',
        '',
        `<${dashboardLink}|View in Dashboard>`,
      ]
        .filter(Boolean)
        .join('\n'),
    })
  } catch (err) {
    console.error(`Failed to post escalation message for ${incidentId}:`, err)
  }

  await db.update(incidents).set({ status: 'escalated', escalatedAt: new Date() }).where(eq(incidents.id, incidentId))
  await recordAction(incidentId, 'escalate', performedBy)
  await postThreadReply(incidentId, ':rotating_light: Incident escalated — team notified')

  incidentEvents.emitIncidentEvent({
    type: 'incident:status_changed',
    incidentId,
    orgId: incident.orgId,
    repo: incident.repo,
    data: { status: 'escalated' },
  })

  return { success: true }
}

// ──────────────────────────────────────────────
// 6. Handle fix PR merged (notify + prepare for auto-resolve)
// ──────────────────────────────────────────────

export async function handleFixPRMerged(prUrl: string, prNumber: number, orgId: string): Promise<void> {
  const incident = await findIncidentByPrUrl(prUrl, orgId)
  if (!incident) return

  await recordAction(incident.id, 'pr_merged', null, { prUrl, prNumber })
  await postThreadReply(incident.id, `Fix PR #${prNumber} merged — waiting for CI to confirm the fix`)

  console.log(`Incident ${incident.id}: fix PR #${prNumber} merged, awaiting CI confirmation`)
}

// ──────────────────────────────────────────────
// 7. Auto-resolve incident when CI passes after a fix PR
// ──────────────────────────────────────────────

export async function autoResolveAfterCIPass(
  repo: string,
  branch: string,
  runId: number,
  orgId: string,
): Promise<void> {
  const incident = await findFixingIncidentForRepoBranch(repo, branch, orgId)
  if (!incident) return

  const mttrSeconds = incident.triggeredAt
    ? Math.round((Date.now() - new Date(incident.triggeredAt).getTime()) / 1000)
    : null

  const updates: Record<string, unknown> = {
    status: 'resolved',
    resolvedAt: new Date(),
  }
  if (mttrSeconds !== null) updates.mttrSeconds = mttrSeconds

  await db.update(incidents).set(updates).where(eq(incidents.id, incident.id))
  await recordAction(incident.id, 'auto_resolved', null, { triggeredByRunId: runId })
  await postThreadReply(incident.id, `CI passed after fix — incident auto-resolved`)

  const brief = parseBrief(incident.briefJson)
  if (brief) {
    await updateSlackToResolved(incident.id, 'CI passed after fix PR merge', mttrSeconds)
  }

  saveResolvedPattern(incident.id).catch((err) =>
    console.error(`Failed to save pattern for auto-resolved incident ${incident.id}:`, err),
  )

  incidentEvents.emitIncidentEvent({
    type: 'incident:status_changed',
    incidentId: incident.id,
    orgId: incident.orgId,
    repo: incident.repo,
    data: { status: 'resolved' },
  })

  console.log(`Incident ${incident.id}: auto-resolved after CI pass on ${repo}/${branch}`)
}
